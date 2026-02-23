import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';

const SECRET = 'test-secret-key';

describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it correctly', async () => {
    const hash = await hashPassword('mysecurepassword');
    expect(hash).not.toBe('mysecurepassword');
    await expect(verifyPassword('mysecurepassword', hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('correctpassword');
    await expect(verifyPassword('wrongpassword', hash)).resolves.toBe(false);
  });

  it('produces different hashes for the same password (salt)', async () => {
    const hash1 = await hashPassword('samepassword');
    const hash2 = await hashPassword('samepassword');
    expect(hash1).not.toBe(hash2);
  });
});

describe('signToken / verifyToken', () => {
  it('signs and verifies a token round-trip', () => {
    const payload = { teamId: 'team-123', agentName: 'alice' };
    const token = signToken(payload, SECRET, 3600);
    const decoded = verifyToken(token, SECRET);
    expect(decoded.teamId).toBe('team-123');
    expect(decoded.agentName).toBe('alice');
  });

  it('throws on wrong secret', () => {
    const token = signToken({ teamId: 't1', agentName: 'bob' }, SECRET, 3600);
    expect(() => verifyToken(token, 'wrong-secret')).toThrow();
  });

  it('throws on expired token', async () => {
    const token = signToken({ teamId: 't1', agentName: 'bob' }, SECRET, -1);
    expect(() => verifyToken(token, SECRET)).toThrow();
  });
});
