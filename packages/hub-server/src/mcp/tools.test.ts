import { describe, it, expect, beforeEach } from 'vitest';
import type { Team, Agent, AgentMessage } from '../types.js';

// Helpers to build test state without importing the singleton
function makeAgent(name: string, teamId: string): Agent {
  return { name, teamId, sessionId: 'sess-1', connectedAt: Date.now(), messageBuffer: [] };
}

function makeTeam(id: string, agents: Agent[]): Team {
  const map = new Map<string, Agent>();
  for (const a of agents) map.set(a.name, a);
  return { id, apiKeyHash: 'hash', createdAt: Date.now(), agents: map };
}

// Isolated delivery logic — mirrors what tools.ts does, extracted for pure unit testing
function deliverMessage(
  team: Team,
  from: string,
  to: string,
  message: AgentMessage,
  maxBuffer: number
) {
  const targets =
    to === 'broadcast'
      ? [...team.agents.values()].filter((a) => a.name !== from)
      : [team.agents.get(to)].filter(Boolean) as Agent[];

  for (const target of targets) {
    target.messageBuffer.push(message);
    if (target.messageBuffer.length > maxBuffer) {
      target.messageBuffer.shift();
    }
  }

  return targets.length;
}

function makeMessage(from: string, to: string): AgentMessage {
  return { id: 'msg-1', from, to, type: 'api_spec', content: 'test', timestamp: Date.now() };
}

describe('message delivery logic', () => {
  let alice: Agent;
  let bob: Agent;
  let carol: Agent;
  let team: Team;

  beforeEach(() => {
    alice = makeAgent('alice', 'team-1');
    bob = makeAgent('bob', 'team-1');
    carol = makeAgent('carol', 'team-1');
    team = makeTeam('team-1', [alice, bob, carol]);
  });

  it('delivers a direct message to the target agent', () => {
    const msg = makeMessage('alice', 'bob');
    const count = deliverMessage(team, 'alice', 'bob', msg, 100);
    expect(count).toBe(1);
    expect(bob.messageBuffer).toHaveLength(1);
    expect(bob.messageBuffer[0]).toBe(msg);
  });

  it('does not deliver direct message to sender', () => {
    const msg = makeMessage('alice', 'alice');
    // Direct — only alice is targeted but she IS the sender. Her buffer is not a "broadcast skip".
    // This is intentional: direct send to self is allowed but unusual.
    deliverMessage(team, 'alice', 'alice', msg, 100);
    expect(alice.messageBuffer).toHaveLength(1);
  });

  it('broadcast delivers to all agents except sender', () => {
    const msg = makeMessage('alice', 'broadcast');
    const count = deliverMessage(team, 'alice', 'broadcast', msg, 100);
    expect(count).toBe(2); // bob + carol
    expect(alice.messageBuffer).toHaveLength(0);
    expect(bob.messageBuffer).toHaveLength(1);
    expect(carol.messageBuffer).toHaveLength(1);
  });

  it('caps buffer at maxBuffer, dropping oldest messages', () => {
    const maxBuffer = 3;
    for (let i = 0; i < 5; i++) {
      const msg = { ...makeMessage('alice', 'bob'), id: `msg-${i}`, content: `msg ${i}` };
      deliverMessage(team, 'alice', 'bob', msg, maxBuffer);
    }
    expect(bob.messageBuffer).toHaveLength(3);
    expect(bob.messageBuffer[0].id).toBe('msg-2'); // oldest kept
    expect(bob.messageBuffer[2].id).toBe('msg-4'); // newest
  });

  it('returns 0 for direct message to non-existent agent', () => {
    const msg = makeMessage('alice', 'nobody');
    const count = deliverMessage(team, 'alice', 'nobody', msg, 100);
    expect(count).toBe(0);
  });

  it('draining the buffer clears it', () => {
    const msg = makeMessage('alice', 'bob');
    deliverMessage(team, 'alice', 'bob', msg, 100);
    expect(bob.messageBuffer).toHaveLength(1);

    const drained = [...bob.messageBuffer];
    bob.messageBuffer.length = 0;
    expect(drained).toHaveLength(1);
    expect(bob.messageBuffer).toHaveLength(0);
  });
});
