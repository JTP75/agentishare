import EventSource from 'eventsource';
import { fetch } from 'undici';
import type { AgentMessage, AgentInfo } from './types.js';

export interface HubClientOptions {
  hubUrl: string;
  teamId: string;
  password: string;
  agentName: string;
}

export class HubClient {
  private token = '';
  private es?: EventSource;
  private messageBuffer: AgentMessage[] = [];
  private readonly opts: HubClientOptions;

  constructor(opts: HubClientOptions) {
    this.opts = opts;
  }

  async join(): Promise<void> {
    const res = await fetch(`${this.opts.hubUrl}/teams/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: this.opts.teamId,
        agentName: this.opts.agentName,
        password: this.opts.password,
      }),
    });

    if (!res.ok) {
      const body = await res.json() as { error: string };
      throw new Error(`Failed to join team: ${body.error}`);
    }

    const data = await res.json() as { token: string };
    this.token = data.token;
  }

  connectSSE(): void {
    const url = `${this.opts.hubUrl}/sse?token=${encodeURIComponent(this.token)}`;
    this.es = new EventSource(url);

    this.es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as AgentMessage;
        this.messageBuffer.push(msg);
      } catch {
        // ignore malformed events
      }
    };

    this.es.onerror = () => {
      process.stderr.write('[agent-hub] SSE connection error — will retry automatically\n');
    };
  }

  async send(to: string, type: string, content: string): Promise<{ ok: boolean; messageId: string; deliveredTo: number }> {
    const res = await fetch(`${this.opts.hubUrl}/agent/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ to, type, content }),
    });

    if (!res.ok) {
      const body = await res.json() as { error: string };
      throw new Error(`Send failed: ${body.error}`);
    }

    return res.json() as Promise<{ ok: boolean; messageId: string; deliveredTo: number }>;
  }

  async listAgents(): Promise<AgentInfo[]> {
    const res = await fetch(`${this.opts.hubUrl}/agent/list`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });

    if (!res.ok) {
      const body = await res.json() as { error: string };
      throw new Error(`List agents failed: ${body.error}`);
    }

    return res.json() as Promise<AgentInfo[]>;
  }

  flushMessages(): AgentMessage[] {
    const msgs = [...this.messageBuffer];
    this.messageBuffer.length = 0;
    return msgs;
  }

  close(): void {
    this.es?.close();
  }
}
