import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { validate, sendMessageSchema } from '../middleware/validation.js';
import { store, connections } from '../store/index.js';
import type { AgentMessage, AuthToken } from '../types.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const MAX_BUFFER = config.get<number>(Sections.SSE, Keys.MAX_MESSAGE_BUFFER_SIZE, 100);
const keepAliveMs = config.get<number>(Sections.SSE, Keys.KEEP_ALIVE_INTERVAL_MS, 15000);

export const agentRouter = Router();

// POST /agent/send — used by mcp-client to deliver messages via REST
agentRouter.post('/send', requireAuth, validate(sendMessageSchema), async (req, res) => {
  const auth = res.locals['auth'] as AuthToken;
  const { to, type, content } = req.body as { to: string; type: AgentMessage['type']; content: string };

  const team = await store.getTeam(auth.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const message: AgentMessage = {
    id: uuidv4(),
    from: auth.agentName,
    to,
    type,
    content,
    timestamp: Date.now(),
  };

  const targets =
    to === 'broadcast'
      ? (await store.listAgents(auth.teamId)).filter((a) => a.name !== auth.agentName)
      : [await store.getAgent(auth.teamId, to)].filter(Boolean) as Awaited<ReturnType<typeof store.getAgent>>[];

  for (const target of targets) {
    await store.pushMessage(auth.teamId, target!.name, message, MAX_BUFFER);
    connections.get(`${auth.teamId}:${target!.name}`)?.(message);
  }

  res.json({ ok: true, messageId: message.id, deliveredTo: targets.length });
});

// GET /agent/stream — plain SSE stream for stdio proxy agents (mcp-client)
agentRouter.get('/stream', requireAuth, async (req, res) => {
  const auth = res.locals['auth'] as AuthToken;

  const team = await store.getTeam(auth.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const keepAlive = setInterval(() => res.write(': keep-alive\n\n'), keepAliveMs);

  // Preserve buffered messages across reconnects
  const existing = await store.getAgent(auth.teamId, auth.agentName);
  await store.saveAgent({
    name: auth.agentName,
    teamId: auth.teamId,
    sessionId: uuidv4(),
    connectedAt: Date.now(),
    messageBuffer: existing?.messageBuffer ?? [],
  });

  const pushFn = (msg: AgentMessage) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
  connections.set(`${auth.teamId}:${auth.agentName}`, pushFn);

  res.on('close', async () => {
    clearInterval(keepAlive);
    connections.delete(`${auth.teamId}:${auth.agentName}`);
    await store.removeAgent(auth.teamId, auth.agentName);
  });
});

// GET /agent/list — used by mcp-client to list connected agents
agentRouter.get('/list', requireAuth, async (req, res) => {
  const auth = res.locals['auth'] as AuthToken;

  const team = await store.getTeam(auth.teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const agents = (await store.listAgents(auth.teamId)).map((a) => ({
    name: a.name,
    connectedAt: a.connectedAt,
    pendingMessages: a.messageBuffer.length,
  }));

  res.json(agents);
});
