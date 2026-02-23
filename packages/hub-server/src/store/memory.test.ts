import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStore } from './memory.js';
import type { AgentMessage } from '../types.js';

function makeMsg(from: string, to: string, id = 'msg-1'): AgentMessage {
  return { id, from, to, type: 'api_spec', content: 'test', timestamp: Date.now() };
}

describe('MemoryStore', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  // ─── Teams ────────────────────────────────────────────────────────────────

  describe('teams', () => {
    it('creates and retrieves a team by id', async () => {
      await store.createTeam({ id: 'team-1', apiKeyHash: 'hash-abc', createdAt: 1000 });
      const team = await store.getTeam('team-1');
      expect(team).toMatchObject({ id: 'team-1', apiKeyHash: 'hash-abc' });
    });

    it('returns null for unknown team id', async () => {
      expect(await store.getTeam('nope')).toBeNull();
    });

    it('lists all teams', async () => {
      await store.createTeam({ id: 'team-1', apiKeyHash: 'h1', createdAt: 1 });
      await store.createTeam({ id: 'team-2', apiKeyHash: 'h2', createdAt: 2 });
      const teams = await store.listTeams();
      expect(teams).toHaveLength(2);
      expect(teams.map((t) => t.id)).toEqual(expect.arrayContaining(['team-1', 'team-2']));
    });

    it('finds a team by api key hash', async () => {
      await store.createTeam({ id: 'team-1', apiKeyHash: 'correct-hash', createdAt: 1 });
      const found = await store.findTeamByApiKeyHash('correct-hash');
      expect(found?.id).toBe('team-1');
    });

    it('returns null for unknown api key hash', async () => {
      await store.createTeam({ id: 'team-1', apiKeyHash: 'correct-hash', createdAt: 1 });
      expect(await store.findTeamByApiKeyHash('wrong-hash')).toBeNull();
    });
  });

  // ─── Agents ───────────────────────────────────────────────────────────────

  describe('agents', () => {
    beforeEach(async () => {
      await store.createTeam({ id: 'team-1', apiKeyHash: 'h1', createdAt: 1 });
      await store.createTeam({ id: 'team-2', apiKeyHash: 'h2', createdAt: 2 });
    });

    it('saves and retrieves an agent', async () => {
      await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
      const agent = await store.getAgent('team-1', 'alice');
      expect(agent).toMatchObject({ name: 'alice', teamId: 'team-1' });
    });

    it('returns null for unknown agent', async () => {
      expect(await store.getAgent('team-1', 'nobody')).toBeNull();
    });

    it('lists only agents belonging to the requested team', async () => {
      await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
      await store.saveAgent({ name: 'bob',   teamId: 'team-1', sessionId: 's2', connectedAt: 2, messageBuffer: [] });
      await store.saveAgent({ name: 'carol', teamId: 'team-2', sessionId: 's3', connectedAt: 3, messageBuffer: [] });

      const team1Agents = await store.listAgents('team-1');
      expect(team1Agents).toHaveLength(2);
      expect(team1Agents.map((a) => a.name)).toEqual(expect.arrayContaining(['alice', 'bob']));

      const team2Agents = await store.listAgents('team-2');
      expect(team2Agents).toHaveLength(1);
      expect(team2Agents[0].name).toBe('carol');
    });

    it('removes an agent', async () => {
      await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
      await store.removeAgent('team-1', 'alice');
      expect(await store.getAgent('team-1', 'alice')).toBeNull();
      expect(await store.listAgents('team-1')).toHaveLength(0);
    });

    it('overwriting an agent replaces the record', async () => {
      await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 'old', connectedAt: 1, messageBuffer: [] });
      await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 'new', connectedAt: 2, messageBuffer: [] });
      const agent = await store.getAgent('team-1', 'alice');
      expect(agent?.sessionId).toBe('new');
    });
  });

  // ─── Message buffer ────────────────────────────────────────────────────────

  describe('message buffer', () => {
    beforeEach(async () => {
      await store.createTeam({ id: 'team-1', apiKeyHash: 'h1', createdAt: 1 });
      await store.saveAgent({ name: 'bob', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
    });

    it('pushes a message into the agent buffer', async () => {
      await store.pushMessage('team-1', 'bob', makeMsg('alice', 'bob'), 100);
      const agent = await store.getAgent('team-1', 'bob');
      expect(agent?.messageBuffer).toHaveLength(1);
    });

    it('caps buffer at maxBuffer, dropping the oldest', async () => {
      for (let i = 0; i < 5; i++) {
        await store.pushMessage('team-1', 'bob', makeMsg('alice', 'bob', `msg-${i}`), 3);
      }
      const agent = await store.getAgent('team-1', 'bob');
      expect(agent?.messageBuffer).toHaveLength(3);
      expect(agent?.messageBuffer[0].id).toBe('msg-2');
      expect(agent?.messageBuffer[2].id).toBe('msg-4');
    });

    it('flushMessages returns all messages and clears the buffer', async () => {
      await store.pushMessage('team-1', 'bob', makeMsg('alice', 'bob', 'msg-1'), 100);
      await store.pushMessage('team-1', 'bob', makeMsg('alice', 'bob', 'msg-2'), 100);

      const flushed = await store.flushMessages('team-1', 'bob');
      expect(flushed).toHaveLength(2);
      expect(flushed.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);

      const agent = await store.getAgent('team-1', 'bob');
      expect(agent?.messageBuffer).toHaveLength(0);
    });

    it('flushMessages returns empty array for unknown agent', async () => {
      expect(await store.flushMessages('team-1', 'nobody')).toEqual([]);
    });

    it('pushMessage to unknown agent is a no-op', async () => {
      await expect(
        store.pushMessage('team-1', 'nobody', makeMsg('alice', 'nobody'), 100)
      ).resolves.not.toThrow();
    });
  });
});
