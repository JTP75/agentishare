import type { AgentMessage } from '../types.js';

export interface TeamRecord {
  id: string;
  apiKeyHash: string;
  createdAt: number;
}

export interface AgentRecord {
  name: string;
  teamId: string;
  sessionId: string;
  connectedAt: number;
  messageBuffer: AgentMessage[];
}

export interface IStore {
  // Teams
  createTeam(team: TeamRecord): Promise<void>;
  getTeam(teamId: string): Promise<TeamRecord | null>;
  listTeams(): Promise<TeamRecord[]>;
  findTeamByApiKeyHash(hash: string): Promise<TeamRecord | null>;

  // Agents
  saveAgent(agent: AgentRecord): Promise<void>;
  getAgent(teamId: string, agentName: string): Promise<AgentRecord | null>;
  listAgents(teamId: string): Promise<AgentRecord[]>;
  removeAgent(teamId: string, agentName: string): Promise<void>;

  // Message buffer
  pushMessage(teamId: string, agentName: string, msg: AgentMessage, maxBuffer: number): Promise<void>;
  flushMessages(teamId: string, agentName: string): Promise<AgentMessage[]>;
}
