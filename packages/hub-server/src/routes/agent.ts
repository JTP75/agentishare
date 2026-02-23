import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { validate, sendMessageSchema } from '../middleware/validation.js';
import { state } from '../state.js';
import type { Agent, AgentMessage, AuthToken } from '../types.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const MAX_BUFFER = config.get<number>(Sections.SSE, Keys.MAX_MESSAGE_BUFFER_SIZE, 100);
const keepAliveMs = config.get<number>(Sections.SSE, Keys.KEEP_ALIVE_INTERVAL_MS, 15000);

export const agentRouter = Router();

// POST /agent/send — used by mcp-client to deliver messages via REST
agentRouter.post('/send', requireAuth, validate(sendMessageSchema), (req, res) => {
  const auth = res.locals['auth'] as AuthToken;
  const { to, type, content } = req.body as { to: string; type: AgentMessage['type']; content: string };

  const team = state.teams.get(auth.teamId);
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

  const targets: Agent[] =
    to === 'broadcast'
      ? [...team.agents.values()].filter((a) => a.name !== auth.agentName)
      : ([team.agents.get(to)].filter(Boolean) as Agent[]);

  for (const target of targets) {
    target.messageBuffer.push(message);
    if (target.messageBuffer.length > MAX_BUFFER) {
      target.messageBuffer.shift();
    }
    target.push?.(message);
  }

  res.json({ ok: true, messageId: message.id, deliveredTo: targets.length });
});

// GET /agent/stream — plain SSE stream for stdio proxy agents (mcp-client)
// Registers the agent in team state and pushes AgentMessages in real-time.
agentRouter.get('/stream', requireAuth, (req, res) => {
  const auth = res.locals['auth'] as AuthToken;
  const team = state.teams.get(auth.teamId);

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

  // Register (or re-register on reconnect) the agent in team state
  team.agents.set(auth.agentName, {
    name: auth.agentName,
    teamId: auth.teamId,
    sessionId: uuidv4(),
    connectedAt: Date.now(),
    messageBuffer: team.agents.get(auth.agentName)?.messageBuffer ?? [],
    push: (msg: AgentMessage) => res.write(`data: ${JSON.stringify(msg)}\n\n`),
  });

  res.on('close', () => {
    clearInterval(keepAlive);
    // Clear push fn but keep agent in state briefly so in-flight messages aren't lost
    const agent = team.agents.get(auth.agentName);
    if (agent) agent.push = undefined;
    team.agents.delete(auth.agentName);
  });
});

// GET /agent/list — used by mcp-client to list connected agents
agentRouter.get('/list', requireAuth, (req, res) => {
  const auth = res.locals['auth'] as AuthToken;
  const team = state.teams.get(auth.teamId);

  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const agents = [...team.agents.values()].map((a) => ({
    name: a.name,
    connectedAt: a.connectedAt,
    pendingMessages: a.messageBuffer.length,
  }));

  res.json(agents);
});
