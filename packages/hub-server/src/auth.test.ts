import { describe, it, expect } from 'vitest';
import { generateApiKey, hashApiKey } from './auth.js';

describe('generateApiKey', () => {
  it('returns a 64-character hex string', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces unique keys on each call', () => {
    const keys = new Set(Array.from({ length: 10 }, () => generateApiKey()));
    expect(keys.size).toBe(10);
  });
});

describe('hashApiKey', () => {
  it('returns a 64-character hex SHA-256 hash', () => {
    const hash = hashApiKey('somekey');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashApiKey('abc')).toBe(hashApiKey('abc'));
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey('key1')).not.toBe(hashApiKey('key2'));
  });

  it('round-trips: hash of generated key matches stored hash', () => {
    const key = generateApiKey();
    const stored = hashApiKey(key);
    expect(hashApiKey(key)).toBe(stored);
  });
});
