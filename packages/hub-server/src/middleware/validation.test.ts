import { describe, it, expect } from 'vitest';
import { sendMessageSchema } from './validation.js';

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
