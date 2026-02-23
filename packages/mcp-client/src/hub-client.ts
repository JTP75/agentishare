import EventSource from 'eventsource';
import { fetch } from 'undici';
import type { AgentMessage, AgentInfo } from './types.js';

export interface HubClientOptions {
  hubUrl: string;
  apiKey: string;
  agentName: string;
}

export class HubClient {
  private es?: EventSource;
  private messageBuffer: AgentMessage[] = [];
  private readonly opts: HubClientOptions;

  constructor(opts: HubClientOptions) {
    this.opts = opts;
  }

  connectSSE(): void {
    const { hubUrl, apiKey, agentName } = this.opts;
    const url = `${hubUrl}/agent/stream?api_key=${encodeURIComponent(apiKey)}&agent_name=${encodeURIComponent(agentName)}`;
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
    const { hubUrl, apiKey, agentName } = this.opts;
    const res = await fetch(`${hubUrl}/agent/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Agent-Name': agentName,
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
    const { hubUrl, apiKey, agentName } = this.opts;
    const res = await fetch(`${hubUrl}/agent/list`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Agent-Name': agentName,
      },
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
