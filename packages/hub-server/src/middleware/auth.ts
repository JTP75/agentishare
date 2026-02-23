import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../auth.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const secret = config.get(Sections.AUTH, Keys.TOKEN_SECRET, 'fallback-dev-secret');

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query['token'] as string | undefined);

  if (!token) {
    res.status(401).json({ error: 'Missing auth token' });
    return;
  }

  try {
    res.locals['auth'] = verifyToken(token, secret);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
