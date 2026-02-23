export type MessageType = 'api_spec' | 'file_change' | 'decision' | 'todo' | 'question';

export interface AgentMessage {
  id: string;
  from: string;
  to: string; // agent name or 'broadcast'
  type: MessageType;
  content: string;
  timestamp: number;
}

export interface Agent {
  name: string;
  teamId: string;
  sessionId: string;
  connectedAt: number;
  messageBuffer: AgentMessage[];
}

export interface Team {
  id: string;
  passwordHash: string;
  createdAt: number;
  agents: Map<string, Agent>;
}

export interface AuthToken {
  teamId: string;
  agentName: string;
}
