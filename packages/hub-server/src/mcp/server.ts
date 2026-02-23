import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type { Response } from 'express';
import type { AuthToken } from '../types.js';
import { registerTools } from './tools.js';

// Maps sessionId → transport so POST /messages/:sessionId can relay to the right connection.
export const sseTransports = new Map<string, SSEServerTransport>();

export async function createAgentMcpServer(
  auth: AuthToken,
  res: Response
): Promise<SSEServerTransport> {
  const server = new McpServer({
    name: 'agent-hub',
    version: '0.1.0',
  });

  registerTools(server, auth);

  const transport = new SSEServerTransport('/messages', res);
  sseTransports.set(transport.sessionId, transport);

  res.on('close', () => {
    sseTransports.delete(transport.sessionId);
  });

  await server.connect(transport);
  return transport;
}
