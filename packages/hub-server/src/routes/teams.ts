import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { state } from '../state.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { validate, createTeamSchema, joinTeamSchema } from '../middleware/validation.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const secret = config.get(Sections.AUTH, Keys.TOKEN_SECRET, 'fallback-dev-secret');
const expiry = config.get<number>(Sections.AUTH, Keys.TOKEN_EXPIRY_SECONDS, 86400);

export const teamsRouter = Router();

teamsRouter.post('/create', validate(createTeamSchema), async (req, res) => {
  const { password } = req.body as { password: string };
  const teamId = uuidv4();
  const passwordHash = await hashPassword(password);

  state.teams.set(teamId, {
    id: teamId,
    passwordHash,
    createdAt: Date.now(),
    agents: new Map(),
  });

  res.status(201).json({
    teamId,
    message: 'Team created. Share the teamId and password with your collaborators.',
  });
});

teamsRouter.post('/join', validate(joinTeamSchema), async (req, res) => {
  const { teamId, agentName, password } = req.body as {
    teamId: string;
    agentName: string;
    password: string;
  };

  const team = state.teams.get(teamId);
  if (!team) {
    res.status(404).json({ error: 'Team not found' });
    return;
  }

  const valid = await verifyPassword(password, team.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Invalid team password' });
    return;
  }

  if (team.agents.has(agentName)) {
    res.status(409).json({ error: 'Agent name already taken in this team' });
    return;
  }

  const token = signToken({ teamId, agentName }, secret, expiry);
  res.json({ token, message: 'Joined team. Use token to connect to the SSE stream.' });
});
