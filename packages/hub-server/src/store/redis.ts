import { Redis } from 'ioredis';
import type { IStore, TeamRecord, AgentRecord } from './types.js';
import type { AgentMessage } from '../types.js';

type AgentMeta = Omit<AgentRecord, 'messageBuffer'>;

export class RedisStore implements IStore {
  readonly client: Redis;

  constructor(url: string = process.env['REDIS_URL'] ?? 'redis://localhost:6379') {
    this.client = new Redis(url, { lazyConnect: true });
  }

  async connect(): Promise<void> {
    await this.client.connect();
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  // ─── Key helpers ──────────────────────────────────────────────────────────

  private k = {
    team:     (id: string)                 => `team:${id}`,
    teams:    ()                           => 'teams',
    teamHash: (hash: string)               => `teamhash:${hash}`,
    agent:    (teamId: string, name: string) => `agent:${teamId}:${name}`,
    agents:   (teamId: string)             => `agents:${teamId}`,
    msgs:     (teamId: string, name: string) => `msgs:${teamId}:${name}`,
  };

  // ─── Teams ────────────────────────────────────────────────────────────────

  async createTeam(team: TeamRecord): Promise<void> {
    const pipe = this.client.pipeline();
    pipe.set(this.k.team(team.id), JSON.stringify(team));
    pipe.sadd(this.k.teams(), team.id);
    pipe.set(this.k.teamHash(team.apiKeyHash), team.id);
    await pipe.exec();
  }

  async getTeam(teamId: string): Promise<TeamRecord | null> {
    const raw = await this.client.get(this.k.team(teamId));
    return raw ? (JSON.parse(raw) as TeamRecord) : null;
  }

  async listTeams(): Promise<TeamRecord[]> {
    const ids = await this.client.smembers(this.k.teams());
    if (ids.length === 0) return [];
    const pipe = this.client.pipeline();
    for (const id of ids) pipe.get(this.k.team(id));
    const results = await pipe.exec() ?? [];
    return results
      .map(([, raw]: [Error | null, unknown]) => (raw ? JSON.parse(raw as string) as TeamRecord : null))
      .filter(Boolean) as TeamRecord[];
  }

  async findTeamByApiKeyHash(hash: string): Promise<TeamRecord | null> {
    const teamId = await this.client.get(this.k.teamHash(hash));
    if (!teamId) return null;
    return this.getTeam(teamId);
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  async saveAgent(agent: AgentRecord): Promise<void> {
    const { messageBuffer, ...meta } = agent;
    const pipe = this.client.pipeline();
    pipe.set(this.k.agent(agent.teamId, agent.name), JSON.stringify(meta));
    pipe.sadd(this.k.agents(agent.teamId), agent.name);
    // Always replace the message buffer with exactly what was provided
    pipe.del(this.k.msgs(agent.teamId, agent.name));
    for (const msg of messageBuffer) {
      pipe.rpush(this.k.msgs(agent.teamId, agent.name), JSON.stringify(msg));
    }
    await pipe.exec();
  }

  async getAgent(teamId: string, agentName: string): Promise<AgentRecord | null> {
    const pipe = this.client.pipeline();
    pipe.get(this.k.agent(teamId, agentName));
    pipe.lrange(this.k.msgs(teamId, agentName), 0, -1);
    const results = await pipe.exec() ?? [];
    const metaRaw = results[0][1] as string | null;
    if (!metaRaw) return null;
    const meta = JSON.parse(metaRaw) as AgentMeta;
    const msgRaws = (results[1][1] as string[]) ?? [];
    return { ...meta, messageBuffer: msgRaws.map((r) => JSON.parse(r) as AgentMessage) };
  }

  async listAgents(teamId: string): Promise<AgentRecord[]> {
    const names = await this.client.smembers(this.k.agents(teamId));
    if (names.length === 0) return [];
    const pipe = this.client.pipeline();
    for (const name of names) {
      pipe.get(this.k.agent(teamId, name));
      pipe.lrange(this.k.msgs(teamId, name), 0, -1);
    }
    const results = await pipe.exec() ?? [];
    const agents: AgentRecord[] = [];
    for (let i = 0; i < results.length; i += 2) {
      const metaRaw = results[i][1] as string | null;
      if (!metaRaw) continue; // stale set entry
      const meta = JSON.parse(metaRaw) as AgentMeta;
      const msgRaws = (results[i + 1][1] as string[]) ?? [];
      agents.push({ ...meta, messageBuffer: msgRaws.map((r) => JSON.parse(r) as AgentMessage) });
    }
    return agents;
  }

  async removeAgent(teamId: string, agentName: string): Promise<void> {
    const pipe = this.client.pipeline();
    pipe.del(this.k.agent(teamId, agentName));
    pipe.del(this.k.msgs(teamId, agentName));
    pipe.srem(this.k.agents(teamId), agentName);
    await pipe.exec();
  }

  // ─── Message buffer ────────────────────────────────────────────────────────

  async pushMessage(teamId: string, agentName: string, msg: AgentMessage, maxBuffer: number): Promise<void> {
    const exists = await this.client.exists(this.k.agent(teamId, agentName));
    if (!exists) return;
    const pipe = this.client.pipeline();
    pipe.rpush(this.k.msgs(teamId, agentName), JSON.stringify(msg));
    pipe.ltrim(this.k.msgs(teamId, agentName), -maxBuffer, -1);
    await pipe.exec();
  }

  async flushMessages(teamId: string, agentName: string): Promise<AgentMessage[]> {
    const pipe = this.client.pipeline();
    pipe.lrange(this.k.msgs(teamId, agentName), 0, -1);
    pipe.del(this.k.msgs(teamId, agentName));
    const results = await pipe.exec() ?? [];
    const raws = (results[0][1] as string[]) ?? [];
    return raws.map((r) => JSON.parse(r) as AgentMessage);
  }
}
