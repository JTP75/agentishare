import { Router } from 'express';
import { store } from '../store/index.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const teams = await store.listTeams();
  const agentCounts = await Promise.all(teams.map((t) => store.listAgents(t.id)));
  const agentCount = agentCounts.reduce((n, agents) => n + agents.length, 0);

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    teams: teams.length,
    agents: agentCount,
  });
});
