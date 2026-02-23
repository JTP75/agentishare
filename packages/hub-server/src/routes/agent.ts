import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { validate, sendMessageSchema } from '../middleware/validation.js';
import { state } from '../state.js';
import type { Agent, AgentMessage, AuthToken } from '../types.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const MAX_BUFFER = config.get<number>(Sections.SSE, Keys.MAX_MESSAGE_BUFFER_SIZE, 100);

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
  }

  res.json({ ok: true, messageId: message.id, deliveredTo: targets.length });
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
