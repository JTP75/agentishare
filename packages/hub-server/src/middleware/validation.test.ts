import { describe, it, expect } from 'vitest';
import { createTeamSchema, joinTeamSchema, sendMessageSchema } from './validation.js';

describe('createTeamSchema', () => {
  it('accepts a valid password', () => {
    expect(createTeamSchema.safeParse({ password: 'validpass1' }).success).toBe(true);
  });

  it('rejects password shorter than 8 characters', () => {
    expect(createTeamSchema.safeParse({ password: 'short' }).success).toBe(false);
  });

  it('rejects missing password', () => {
    expect(createTeamSchema.safeParse({}).success).toBe(false);
  });
});

describe('joinTeamSchema', () => {
  const valid = {
    teamId: '550e8400-e29b-41d4-a716-446655440000',
    agentName: 'alice-backend',
    password: 'securepassword',
  };

  it('accepts valid input', () => {
    expect(joinTeamSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects non-UUID teamId', () => {
    expect(joinTeamSchema.safeParse({ ...valid, teamId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects agent name with special characters', () => {
    expect(joinTeamSchema.safeParse({ ...valid, agentName: 'alice backend' }).success).toBe(false);
  });

  it('accepts agent name with hyphens and underscores', () => {
    expect(joinTeamSchema.safeParse({ ...valid, agentName: 'alice_backend-01' }).success).toBe(true);
  });

  it('rejects empty agent name', () => {
    expect(joinTeamSchema.safeParse({ ...valid, agentName: '' }).success).toBe(false);
  });
});

describe('sendMessageSchema', () => {
  const valid = {
    to: 'bob',
    type: 'api_spec',
    content: 'GET /users -> [User]',
  };

  it('accepts valid message', () => {
    expect(sendMessageSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts broadcast target', () => {
    expect(sendMessageSchema.safeParse({ ...valid, to: 'broadcast' }).success).toBe(true);
  });

  it('rejects invalid message type', () => {
    expect(sendMessageSchema.safeParse({ ...valid, type: 'unknown' }).success).toBe(false);
  });

  it('rejects empty content', () => {
    expect(sendMessageSchema.safeParse({ ...valid, content: '' }).success).toBe(false);
  });

  it('accepts all valid message types', () => {
    const types = ['api_spec', 'file_change', 'decision', 'todo', 'question'] as const;
    for (const type of types) {
      expect(sendMessageSchema.safeParse({ ...valid, type }).success).toBe(true);
    }
  });
});
