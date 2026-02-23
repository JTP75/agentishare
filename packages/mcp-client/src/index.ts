#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { HubClient } from './hub-client.js';

const HUB_URL = process.env['HUB_URL'] ?? 'http://localhost:3000';
const TEAM_ID = process.env['TEAM_ID'] ?? '';
const TEAM_PASSWORD = process.env['TEAM_PASSWORD'] ?? '';
const AGENT_NAME = process.env['AGENT_NAME'] ?? '';

if (!TEAM_ID || !TEAM_PASSWORD || !AGENT_NAME) {
  process.stderr.write(
    'Error: Required environment variables: TEAM_ID, TEAM_PASSWORD, AGENT_NAME\n' +
    'Optional: HUB_URL (default: http://localhost:3000)\n'
  );
  process.exit(1);
}

const hub = new HubClient({
  hubUrl: HUB_URL,
  teamId: TEAM_ID,
  password: TEAM_PASSWORD,
  agentName: AGENT_NAME,
});

async function main(): Promise<void> {
  await hub.join();
  hub.connectSSE();

  process.stderr.write(`[agent-hub] Connected as "${AGENT_NAME}" on team ${TEAM_ID}\n`);

  const server = new McpServer({ name: 'agent-hub-client', version: '0.1.0' });

  server.tool(
    'agent_hub_send',
    'Send a message to another agent or broadcast to all team members',
    {
      to: z.string().describe('Target agent name, or "broadcast" for all'),
      type: z.enum(['api_spec', 'file_change', 'decision', 'todo', 'question']).describe('Message type'),
      content: z.string().describe('Message content (plain text or JSON string)'),
    },
    async ({ to, type, content }) => {
      const result = await hub.send(to, type, content);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'agent_hub_list_agents',
    'List all agents currently connected in your team',
    {},
    async () => {
      const agents = await hub.listAgents();
      return { content: [{ type: 'text' as const, text: JSON.stringify(agents, null, 2) }] };
    }
  );

  server.tool(
    'agent_hub_receive',
    'Retrieve and clear all buffered messages addressed to you',
    {},
    async () => {
      const messages = hub.flushMessages();
      return { content: [{ type: 'text' as const, text: JSON.stringify(messages, null, 2) }] };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => { hub.close(); process.exit(0); });
  process.on('SIGTERM', () => { hub.close(); process.exit(0); });
}

main().catch((err: Error) => {
  process.stderr.write(`[agent-hub] Fatal error: ${err.message}\n`);
  process.exit(1);
});
