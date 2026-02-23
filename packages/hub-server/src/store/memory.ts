import type { AgentMessage } from '../types.js';
import type { IStore, TeamRecord, AgentRecord } from './types.js';

export class MemoryStore implements IStore {
  private teams = new Map<string, TeamRecord>();
  private agents = new Map<string, AgentRecord>(); // key: `${teamId}:${agentName}`

  async createTeam(team: TeamRecord): Promise<void> {
    this.teams.set(team.id, team);
  }

  async getTeam(teamId: string): Promise<TeamRecord | null> {
    return this.teams.get(teamId) ?? null;
  }

  async listTeams(): Promise<TeamRecord[]> {
    return [...this.teams.values()];
  }

  async findTeamByApiKeyHash(hash: string): Promise<TeamRecord | null> {
    return [...this.teams.values()].find((t) => t.apiKeyHash === hash) ?? null;
  }

  async saveAgent(agent: AgentRecord): Promise<void> {
    this.agents.set(`${agent.teamId}:${agent.name}`, agent);
  }

  async getAgent(teamId: string, agentName: string): Promise<AgentRecord | null> {
    return this.agents.get(`${teamId}:${agentName}`) ?? null;
  }

  async listAgents(teamId: string): Promise<AgentRecord[]> {
    return [...this.agents.values()].filter((a) => a.teamId === teamId);
  }

  async removeAgent(teamId: string, agentName: string): Promise<void> {
    this.agents.delete(`${teamId}:${agentName}`);
  }

  async pushMessage(teamId: string, agentName: string, msg: AgentMessage, maxBuffer: number): Promise<void> {
    const agent = this.agents.get(`${teamId}:${agentName}`);
    if (!agent) return;
    agent.messageBuffer.push(msg);
    if (agent.messageBuffer.length > maxBuffer) agent.messageBuffer.shift();
  }

  async flushMessages(teamId: string, agentName: string): Promise<AgentMessage[]> {
    const agent = this.agents.get(`${teamId}:${agentName}`);
    if (!agent) return [];
    const msgs = [...agent.messageBuffer];
    agent.messageBuffer.length = 0;
    return msgs;
  }
}
