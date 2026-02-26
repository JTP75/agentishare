import { randomBytes } from 'crypto';
import WebSocket from 'ws';
import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools';
import type { ITransport, ITransportOptions } from './transport.js';
import type { AgentMessage, AgentInfo, MessageType } from './types.js';

// Custom event kinds (not officially assigned — stored as regular events by relays)
const AGENT_MSG_KIND = 1337;
const PRESENCE_KIND = 1338;

const DEFAULT_RELAY_URL = 'wss://nos.lol';

// Heartbeat: re-publish presence every 60s so late joiners can discover us.
// Subscription window is 1.5× the interval so there is always overlap.
const HEARTBEAT_MS = 60_000;
const PRESENCE_WINDOW_S = 90;

export interface NostrClientOptions extends ITransportOptions {
  agentName: string;
  relayUrl: string;
  teamId?: string;     // shared group identifier; undefined until createTeam/join
  privateKey?: string; // hex-encoded secp256k1 private key; generated on first use
}

interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export class NostrClient implements ITransport {
  private opts: NostrClientOptions;
  private ws?: WebSocket;
  private heartbeat?: ReturnType<typeof setInterval>;
  private messageBuffer: AgentMessage[] = [];
  private knownAgents = new Map<string, AgentInfo>();
  private pendingPublish = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  private readonly subId: string;

  constructor(opts: NostrClientOptions) {
    this.opts = { ...opts };
    this.subId = `ah-${randomBytes(4).toString('hex')}`;
  }

  isConfigured(): boolean {
    return !!(this.opts.teamId && this.opts.agentName);
  }

  configure(opts: ITransportOptions): void {
    const o = opts as Record<string, unknown>;
    this.opts = {
      agentName: String(o['agentName'] ?? ''),
      relayUrl: String(o['relayUrl'] ?? o['hubUrl'] ?? this.opts.relayUrl),
      teamId: o['teamId'] != null ? String(o['teamId']) : o['apiKey'] != null ? String(o['apiKey']) : undefined,
      privateKey: o['privateKey'] != null ? String(o['privateKey']) : this.opts.privateKey,
    };
  }

  identity(): { agentName: string; pubkey: string; relayUrl: string } {
    const privkey = this.ensurePrivkey();
    return {
      agentName: this.opts.agentName,
      pubkey: getPublicKey(privkey),
      relayUrl: this.opts.relayUrl,
    };
  }

  async createTeam(): Promise<{ teamId: string; apiKey: string }> {
    const teamId = randomBytes(16).toString('hex');
    this.opts.teamId = teamId;
    this.ensurePrivkey(); // generate + cache before exportConfig is called
    return { teamId, apiKey: teamId };
  }

  connect(): void {
    if (!this.opts.teamId) return;
    clearInterval(this.heartbeat);
    this.ws?.close();
    this.ws = new WebSocket(this.opts.relayUrl);

    this.ws.on('open', () => {
      this.subscribe();
      this.publishPresence();
      this.heartbeat = setInterval(() => this.publishPresence(), HEARTBEAT_MS);
    });

    this.ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString()) as unknown[];
        if (msg[0] === 'EVENT' && msg[2]) this.handleEvent(msg[2] as NostrEvent);
        if (msg[0] === 'OK') this.handleOk(msg as [string, string, boolean, string]);
      } catch { /* ignore malformed relay messages */ }
    });

    this.ws.on('error', () => {
      process.stderr.write('[agent-hub] Nostr relay connection error — will retry automatically\n');
    });
  }

  async send(to: string, type: string, content: string): Promise<{ ok: boolean; messageId: string; deliveredTo: number }> {
    if (!this.ws) {
      throw new Error('Not connected to relay. Call connect() first.');
    }
    // If the WebSocket is still opening, wait for it (up to 10s)
    if (this.ws.readyState === 0 /* CONNECTING */) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('Connection timeout waiting for relay')), 10_000);
        this.ws!.once('open', () => { clearTimeout(t); resolve(); });
        this.ws!.once('error', (e) => { clearTimeout(t); reject(e); });
      });
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Relay connection failed. Check RELAY_URL and network.');
    }
    const privkey = this.ensurePrivkey();
    const event = finalizeEvent({
      kind: AGENT_MSG_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['t', this.opts.teamId!],
        ['agent-from', this.opts.agentName],
        ['agent-to', to],
        ['msg-type', type],
      ],
      content,
    }, privkey);

    await this.publish(event as unknown as NostrEvent);
    return { ok: true, messageId: event.id, deliveredTo: 1 };
  }

  async listAgents(): Promise<AgentInfo[]> {
    return Array.from(this.knownAgents.values());
  }

  flushMessages(): AgentMessage[] {
    const msgs = [...this.messageBuffer];
    this.messageBuffer.length = 0;
    return msgs;
  }

  close(): void {
    clearInterval(this.heartbeat);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(['CLOSE', this.subId]));
      this.ws.close();
    }
  }

  exportConfig(): Record<string, string> {
    this.ensurePrivkey(); // generate before export so privateKey is always present
    return {
      apiKey: this.opts.teamId ?? '',
      agentName: this.opts.agentName,
      hubUrl: this.opts.relayUrl,
      transport: 'nostr',
      privateKey: this.opts.privateKey ?? '',
    };
  }

  // ---------- private ----------

  private ensurePrivkey(): Uint8Array {
    if (!this.opts.privateKey) {
      const sk = generateSecretKey();
      this.opts.privateKey = Buffer.from(sk).toString('hex');
      return sk;
    }
    return new Uint8Array(Buffer.from(this.opts.privateKey, 'hex'));
  }

  private subscribe(): void {
    const filter = {
      kinds: [AGENT_MSG_KIND, PRESENCE_KIND],
      '#t': [this.opts.teamId!],
      since: Math.floor(Date.now() / 1000) - PRESENCE_WINDOW_S,
    };
    this.ws!.send(JSON.stringify(['REQ', this.subId, filter]));
  }

  private publishPresence(): void {
    const privkey = this.ensurePrivkey();
    const event = finalizeEvent({
      kind: PRESENCE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['t', this.opts.teamId!], ['agent', this.opts.agentName]],
      content: '',
    }, privkey);
    this.publish(event as unknown as NostrEvent).catch(() => {});
  }

  private publish(event: NostrEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Not connected to relay'));
        return;
      }

      // Resolve after 5s if relay doesn't send OK (some relays skip NIP-20)
      const timeout = setTimeout(() => {
        if (this.pendingPublish.has(event.id)) {
          this.pendingPublish.delete(event.id);
          resolve();
        }
      }, 5_000);

      this.pendingPublish.set(event.id, {
        resolve: () => { clearTimeout(timeout); resolve(); },
        reject: (e) => { clearTimeout(timeout); reject(e); },
      });

      this.ws.send(JSON.stringify(['EVENT', event]), (err) => {
        if (err) {
          this.pendingPublish.delete(event.id);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  private handleOk(msg: [string, string, boolean, string]): void {
    const [, eventId, accepted, reason] = msg;
    const pending = this.pendingPublish.get(eventId);
    if (!pending) return;
    this.pendingPublish.delete(eventId);
    if (accepted) {
      pending.resolve();
    } else {
      pending.reject(new Error(`Relay rejected event: ${reason}`));
    }
  }

  private handleEvent(event: NostrEvent): void {
    if (event.kind === PRESENCE_KIND) {
      const agentTag = event.tags.find(t => t[0] === 'agent');
      if (agentTag?.[1]) {
        this.knownAgents.set(agentTag[1], {
          name: agentTag[1],
          connectedAt: event.created_at * 1000,
          pendingMessages: 0,
        });
      }
      return;
    }

    if (event.kind === AGENT_MSG_KIND) {
      const from = event.tags.find(t => t[0] === 'agent-from')?.[1];
      const to = event.tags.find(t => t[0] === 'agent-to')?.[1];
      const msgType = event.tags.find(t => t[0] === 'msg-type')?.[1];
      if (!from || !to || !msgType) return;

      this.knownAgents.set(from, { name: from, connectedAt: event.created_at * 1000, pendingMessages: 0 });

      if (to !== this.opts.agentName && to !== 'broadcast') return;

      this.messageBuffer.push({
        id: event.id,
        from,
        to,
        type: msgType as MessageType,
        content: event.content,
        timestamp: event.created_at * 1000,
      });
    }
  }
}

export { DEFAULT_RELAY_URL };
