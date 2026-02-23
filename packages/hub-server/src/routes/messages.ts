import { Router } from 'express';
import { sseTransports } from '../mcp/server.js';

export const messagesRouter = Router();

messagesRouter.post('/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const transport = sseTransports.get(sessionId);

  if (!transport) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  await transport.handlePostMessage(req, res);
});
