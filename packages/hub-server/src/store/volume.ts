import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { dirname } from 'path';
import type { IStore, TeamRecord, AgentRecord } from './types.js';
import type { AgentMessage } from '../types.js';

type AgentMeta = Omit<AgentRecord, 'messageBuffer'>;

interface FileState {
  teams: Record<string, TeamRecord>;
  agents: Record<string, AgentMeta>;          // key: `${teamId}:${agentName}`
  messages: Record<string, AgentMessage[]>;   // key: `${teamId}:${agentName}`
}

const EMPTY: FileState = { teams: {}, agents: {}, messages: {} };

export class VolumeStore implements IStore {
  private readonly path: string;

  constructor(path: string = process.env['VOLUME_DATA_PATH'] ?? '/data/agent-hub.json') {
    this.path = path;
  }

  // ─── Persistence helpers ──────────────────────────────────────────────────

  private load(): FileState {
    try {
      return JSON.parse(readFileSync(this.path, 'utf-8')) as FileState;
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private save(state: FileState): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, this.path); // atomic on POSIX
  }

  private agentKey(teamId: string, agentName: string): string {
    return `${teamId}:${agentName}`;
  }

  // ─── Teams ────────────────────────────────────────────────────────────────

  async createTeam(team: TeamRecord): Promise<void> {
    const state = this.load();
    state.teams[team.id] = team;
    this.save(state);
  }

  async getTeam(teamId: string): Promise<TeamRecord | null> {
    return this.load().teams[teamId] ?? null;
  }

  async listTeams(): Promise<TeamRecord[]> {
    return Object.values(this.load().teams);
  }

  async findTeamByApiKeyHash(hash: string): Promise<TeamRecord | null> {
    return Object.values(this.load().teams).find((t) => t.apiKeyHash === hash) ?? null;
  }

  // ─── Agents ───────────────────────────────────────────────────────────────

  async saveAgent(agent: AgentRecord): Promise<void> {
    const { messageBuffer, ...meta } = agent;
    const key = this.agentKey(agent.teamId, agent.name);
    const state = this.load();
    state.agents[key] = meta;
    state.messages[key] = messageBuffer; // always replace buffer with provided value
    this.save(state);
  }

  async getAgent(teamId: string, agentName: string): Promise<AgentRecord | null> {
    const state = this.load();
    const key = this.agentKey(teamId, agentName);
    const meta = state.agents[key];
    if (!meta) return null;
    return { ...meta, messageBuffer: state.messages[key] ?? [] };
  }

  async listAgents(teamId: string): Promise<AgentRecord[]> {
    const state = this.load();
    return Object.entries(state.agents)
      .filter(([, a]) => a.teamId === teamId)
      .map(([key, meta]) => ({ ...meta, messageBuffer: state.messages[key] ?? [] }));
  }

  async removeAgent(teamId: string, agentName: string): Promise<void> {
    const key = this.agentKey(teamId, agentName);
    const state = this.load();
    delete state.agents[key];
    delete state.messages[key];
    this.save(state);
  }

  // ─── Message buffer ────────────────────────────────────────────────────────

  async pushMessage(teamId: string, agentName: string, msg: AgentMessage, maxBuffer: number): Promise<void> {
    const key = this.agentKey(teamId, agentName);
    const state = this.load();
    if (!state.agents[key]) return; // no-op for unknown agent
    const buf = state.messages[key] ?? [];
    buf.push(msg);
    if (buf.length > maxBuffer) buf.shift();
    state.messages[key] = buf;
    this.save(state);
  }

  async flushMessages(teamId: string, agentName: string): Promise<AgentMessage[]> {
    const key = this.agentKey(teamId, agentName);
    const state = this.load();
    const msgs = state.messages[key] ?? [];
    state.messages[key] = [];
    if (msgs.length > 0) this.save(state);
    return msgs;
  }
}
