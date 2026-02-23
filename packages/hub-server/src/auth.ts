import { createHash, randomBytes } from 'crypto';

export function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
