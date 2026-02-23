import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { store } from '../store/index.js';
import { generateApiKey, hashApiKey } from '../auth.js';

export const teamsRouter = Router();

teamsRouter.post('/create', async (_req, res) => {
  const teamId = uuidv4();
  const apiKey = generateApiKey();

  await store.createTeam({
    id: teamId,
    apiKeyHash: hashApiKey(apiKey),
    createdAt: Date.now(),
  });

  res.status(201).json({
    teamId,
    apiKey,
    message: 'Team created. Share the teamId and apiKey with your collaborators.',
  });
});
