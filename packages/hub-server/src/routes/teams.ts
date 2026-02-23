import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { state } from '../state.js';
import { generateApiKey, hashApiKey } from '../auth.js';

export const teamsRouter = Router();

teamsRouter.post('/create', async (_req, res) => {
  const teamId = uuidv4();
  const apiKey = generateApiKey();

  state.teams.set(teamId, {
    id: teamId,
    apiKeyHash: hashApiKey(apiKey),
    createdAt: Date.now(),
    agents: new Map(),
  });

  res.status(201).json({
    teamId,
    apiKey,
    message: 'Team created. Share the teamId and apiKey with your collaborators.',
  });
});
