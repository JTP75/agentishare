export type MessageType = 'api_spec' | 'file_change' | 'decision' | 'todo' | 'question';

export interface AgentMessage {
  id: string;
  from: string;
  to: string;
  type: MessageType;
  content: string;
  timestamp: number;
}

export interface AgentInfo {
  name: string;
  connectedAt: number;
  pendingMessages: number;
}
