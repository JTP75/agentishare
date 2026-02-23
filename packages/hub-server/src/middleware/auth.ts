import type { Request, Response, NextFunction } from 'express';
import { hashApiKey } from '../auth.js';
import { store } from '../store/index.js';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const key = header?.startsWith('Bearer ')
    ? header.slice(7)
    : (req.query['api_key'] as string | undefined);

  const agentName = (req.headers['x-agent-name'] as string | undefined)
    ?? (req.query['agent_name'] as string | undefined);

  if (!key || !agentName) {
    res.status(401).json({ error: 'Missing api_key and agent_name' });
    return;
  }

  try {
    const team = await store.findTeamByApiKeyHash(hashApiKey(key));

    if (!team) {
      res.status(401).json({ error: 'Invalid API key' });
      return;
    }

    res.locals['auth'] = { teamId: team.id, agentName };
    next();
  } catch (err) {
    next(err);
  }
}
