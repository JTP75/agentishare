import type { AgentMessage, AgentInfo } from './types.js';

export interface ITransportOptions {
  agentName: string;
  [key: string]: unknown;
}

export interface ITransport {
  /** Whether the transport has enough config to connect */
  isConfigured(): boolean;

  /** Update transport configuration */
  configure(opts: ITransportOptions): void;

  /** Return identity info (agent name + transport-specific details) */
  identity(): { agentName: string; [key: string]: unknown };

  /** Create a new team; returns credentials to share */
  createTeam(): Promise<{ teamId: string; apiKey: string }>;

  /** Establish the real-time connection (SSE, WebSocket, etc.) */
  connect(): void;

  /** Send a message to an agent or broadcast */
  send(to: string, type: string, content: string): Promise<{ ok: boolean; messageId: string; deliveredTo: number }>;

  /** List agents in the team */
  listAgents(): Promise<AgentInfo[]>;

  /** Return and clear buffered messages */
  flushMessages(): AgentMessage[];

  /** Disconnect and clean up */
  close(): void;

  /** Return config fields needed to persist and restore credentials (written to config-store) */
  exportConfig(): Record<string, string>;
}
