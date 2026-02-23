import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createAgentMcpServer } from '../mcp/server.js';
import { state } from '../state.js';
import type { AuthToken } from '../types.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const keepAliveMs = config.get<number>(Sections.SSE, Keys.KEEP_ALIVE_INTERVAL_MS, 15000);
const maxAgents = config.get<number>(Sections.TEAM, Keys.MAX_AGENTS_PER_TEAM, 20);

export const sseRouter = Router();

// Auth token can be passed as ?token=... (for EventSource clients that can't set headers)
// or as Authorization: Bearer <token>
sseRouter.get('/', requireAuth, async (req, res, next) => {
  const auth = res.locals['auth'] as AuthToken;
  const team = state.teams.get(auth.teamId);

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  if (team.agents.size >= maxAgents) {
    res.status(429).json({ error: 'Team agent limit reached' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), keepAliveMs);

  try {
    const transport = await createAgentMcpServer(auth, res);

    team.agents.set(auth.agentName, {
      name: auth.agentName,
      teamId: auth.teamId,
      sessionId: transport.sessionId,
      connectedAt: Date.now(),
      messageBuffer: [],
    });

    res.on('close', () => {
      clearInterval(keepAlive);
      team.agents.delete(auth.agentName);
    });
  } catch (err) {
    clearInterval(keepAlive);
    next(err);
  }
});
