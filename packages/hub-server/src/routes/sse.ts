import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { createAgentMcpServer } from '../mcp/server.js';
import { store } from '../store/index.js';
import type { AuthToken } from '../types.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const keepAliveMs = config.get<number>(Sections.SSE, Keys.KEEP_ALIVE_INTERVAL_MS, 15000);
const maxAgents = config.get<number>(Sections.TEAM, Keys.MAX_AGENTS_PER_TEAM, 20);

export const sseRouter = Router();

sseRouter.get('/', requireAuth, async (req, res, next) => {
  const auth = res.locals['auth'] as AuthToken;

  const team = await store.getTeam(auth.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const agentCount = (await store.listAgents(auth.teamId)).length;
  if (agentCount >= maxAgents) {
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

    await store.saveAgent({
      name: auth.agentName,
      teamId: auth.teamId,
      sessionId: transport.sessionId,
      connectedAt: Date.now(),
      messageBuffer: [],
    });

    res.on('close', async () => {
      clearInterval(keepAlive);
      await store.removeAgent(auth.teamId, auth.agentName);
    });
  } catch (err) {
    clearInterval(keepAlive);
    next(err);
  }
});
