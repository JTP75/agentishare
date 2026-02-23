import { Router } from 'express';
import { state } from '../state.js';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  const agentCount = [...state.teams.values()].reduce((n, t) => n + t.agents.size, 0);
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    teams: state.teams.size,
    agents: agentCount,
  });
});
