import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { AuthToken } from './types.js';

const SALT_ROUNDS = 10;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: AuthToken, secret: string, expirySeconds: number): string {
  return jwt.sign(payload, secret, { expiresIn: expirySeconds });
}

export function verifyToken(token: string, secret: string): AuthToken {
  return jwt.verify(token, secret) as AuthToken;
}
