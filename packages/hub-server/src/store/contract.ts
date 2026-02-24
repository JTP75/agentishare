import { describe, it, expect, beforeEach } from 'vitest';
import type { IStore } from './types.js';
import type { AgentMessage } from '../types.js';

function msg(from: string, to: string, id = 'msg-1'): AgentMessage {
  return { id, from, to, type: 'api_spec', content: 'test', timestamp: Date.now() };
}

/**
 * Shared contract tests — every IStore implementation must pass these.
 * Call this from each adapter's test file, passing a factory that returns
 * a fresh, empty store before each test.
 */
export function runStoreContractTests(
  label: string,
  factory: () => Promise<IStore>,
): void {
  describe(label, () => {
    let store: IStore;
    beforeEach(async () => { store = await factory(); });

    // ─── Teams ──────────────────────────────────────────────────────────────

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

    // ─── Agents ─────────────────────────────────────────────────────────────

    describe('agents', () => {
      beforeEach(async () => {
        await store.createTeam({ id: 'team-1', apiKeyHash: 'h1', createdAt: 1 });
        await store.createTeam({ id: 'team-2', apiKeyHash: 'h2', createdAt: 2 });
      });

      it('saves and retrieves an agent', async () => {
        await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
        const agent = await store.getAgent('team-1', 'alice');
        expect(agent).toMatchObject({ name: 'alice', teamId: 'team-1', sessionId: 's1' });
      });

      it('returns null for unknown agent', async () => {
        expect(await store.getAgent('team-1', 'nobody')).toBeNull();
      });

      it('lists only agents belonging to the requested team', async () => {
        await store.saveAgent({ name: 'alice', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
        await store.saveAgent({ name: 'bob',   teamId: 'team-1', sessionId: 's2', connectedAt: 2, messageBuffer: [] });
        await store.saveAgent({ name: 'carol', teamId: 'team-2', sessionId: 's3', connectedAt: 3, messageBuffer: [] });

        const t1 = await store.listAgents('team-1');
        expect(t1).toHaveLength(2);
        expect(t1.map((a) => a.name)).toEqual(expect.arrayContaining(['alice', 'bob']));

        const t2 = await store.listAgents('team-2');
        expect(t2).toHaveLength(1);
        expect(t2[0].name).toBe('carol');
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
        expect((await store.getAgent('team-1', 'alice'))?.sessionId).toBe('new');
      });
    });

    // ─── Message buffer ──────────────────────────────────────────────────────

    describe('message buffer', () => {
      beforeEach(async () => {
        await store.createTeam({ id: 'team-1', apiKeyHash: 'h1', createdAt: 1 });
        await store.saveAgent({ name: 'bob', teamId: 'team-1', sessionId: 's1', connectedAt: 1, messageBuffer: [] });
      });

      it('pushes a message into the agent buffer', async () => {
        await store.pushMessage('team-1', 'bob', msg('alice', 'bob'), 100);
        const agent = await store.getAgent('team-1', 'bob');
        expect(agent?.messageBuffer).toHaveLength(1);
      });

      it('caps buffer at maxBuffer, dropping the oldest', async () => {
        for (let i = 0; i < 5; i++) {
          await store.pushMessage('team-1', 'bob', msg('alice', 'bob', `msg-${i}`), 3);
        }
        const agent = await store.getAgent('team-1', 'bob');
        expect(agent?.messageBuffer).toHaveLength(3);
        expect(agent?.messageBuffer[0].id).toBe('msg-2');
        expect(agent?.messageBuffer[2].id).toBe('msg-4');
      });

      it('flushMessages returns all messages and clears the buffer', async () => {
        await store.pushMessage('team-1', 'bob', msg('alice', 'bob', 'msg-1'), 100);
        await store.pushMessage('team-1', 'bob', msg('alice', 'bob', 'msg-2'), 100);

        const flushed = await store.flushMessages('team-1', 'bob');
        expect(flushed).toHaveLength(2);
        expect(flushed.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
        expect((await store.getAgent('team-1', 'bob'))?.messageBuffer).toHaveLength(0);
      });

      it('flushMessages returns empty array for unknown agent', async () => {
        expect(await store.flushMessages('team-1', 'nobody')).toEqual([]);
      });

      it('pushMessage to unknown agent is a no-op', async () => {
        await expect(
          store.pushMessage('team-1', 'nobody', msg('alice', 'nobody'), 100)
        ).resolves.not.toThrow();
      });

      it('saveAgent with a populated buffer preserves messages on reconnect', async () => {
        await store.pushMessage('team-1', 'bob', msg('alice', 'bob', 'msg-1'), 100);
        const existing = await store.getAgent('team-1', 'bob');
        // Simulate reconnect: re-save agent with the preserved buffer
        await store.saveAgent({ name: 'bob', teamId: 'team-1', sessionId: 'new-session', connectedAt: 2, messageBuffer: existing?.messageBuffer ?? [] });
        const after = await store.getAgent('team-1', 'bob');
        expect(after?.sessionId).toBe('new-session');
        expect(after?.messageBuffer).toHaveLength(1);
        expect(after?.messageBuffer[0].id).toBe('msg-1');
      });

      it('saveAgent with empty buffer clears messages', async () => {
        await store.pushMessage('team-1', 'bob', msg('alice', 'bob', 'msg-1'), 100);
        await store.saveAgent({ name: 'bob', teamId: 'team-1', sessionId: 's2', connectedAt: 2, messageBuffer: [] });
        const after = await store.getAgent('team-1', 'bob');
        expect(after?.messageBuffer).toHaveLength(0);
      });
    });
  });
}
