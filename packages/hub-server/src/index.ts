import express from 'express';
import cors from 'cors';
import { ConfigLoader, Sections, Keys } from './config/index.js';
import { apiLimiter } from './middleware/rateLimiter.js';
import { teamsRouter } from './routes/teams.js';
import { sseRouter } from './routes/sse.js';
import { messagesRouter } from './routes/messages.js';
import { agentRouter } from './routes/agent.js';
import { healthRouter } from './routes/health.js';

const nodeEnv = process.env.NODE_ENV ?? 'development';
const configEnv = nodeEnv === 'production' ? 'prod' : nodeEnv === 'development' ? 'dev' : undefined;
const config = new ConfigLoader(configEnv);

const port = config.get<number>(Sections.SERVER, Keys.PORT, 3000);
const host = config.get(Sections.SERVER, Keys.HOST, '0.0.0.0');
const corsOrigins: string = config.get(Sections.SERVER, Keys.CORS_ORIGINS, '*');

const app = express();

app.use(cors({ origin: corsOrigins === '*' ? '*' : corsOrigins.split(',').map((o) => o.trim()) }));
app.use(express.json({ limit: '1mb' }));
app.use(apiLimiter);

app.use('/teams', teamsRouter);
app.use('/sse', sseRouter);
app.use('/messages', messagesRouter);
app.use('/agent', agentRouter);
app.use('/health', healthRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, host, () => {
  console.log(`Agent Hub running on ${host}:${port} [${nodeEnv}]`);
});
