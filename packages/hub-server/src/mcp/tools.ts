import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { store, connections } from '../store/index.js';
import type { AgentMessage, AuthToken } from '../types.js';
import { ConfigLoader, Sections, Keys } from '../config/index.js';

const config = new ConfigLoader(process.env.NODE_ENV === 'production' ? 'prod' : process.env.NODE_ENV === 'development' ? 'dev' : undefined);
const MAX_BUFFER = config.get<number>(Sections.SSE, Keys.MAX_MESSAGE_BUFFER_SIZE, 100);

export function registerTools(server: McpServer, auth: AuthToken): void {
  server.tool(
    'agent_hub_send',
    'Send a message to another agent or broadcast to all team members',
    {
      to: z.string().describe('Target agent name, or "broadcast" for all agents in the team'),
      type: z.enum(['api_spec', 'file_change', 'decision', 'todo', 'question']).describe('Message type'),
      content: z.string().describe('Message content (plain text or JSON string)'),
    },
    async ({ to, type, content }) => {
      const team = await store.getTeam(auth.teamId);
      if (!team) {
        return { content: [{ type: 'text' as const, text: 'Team not found' }], isError: true };
      }

      const message: AgentMessage = {
        id: uuidv4(),
        from: auth.agentName,
        to,
        type,
        content,
        timestamp: Date.now(),
      };

      const targets =
        to === 'broadcast'
          ? (await store.listAgents(auth.teamId)).filter((a) => a.name !== auth.agentName)
          : [await store.getAgent(auth.teamId, to)].filter(Boolean) as Awaited<ReturnType<typeof store.getAgent>>[];

      for (const target of targets) {
        await store.pushMessage(auth.teamId, target!.name, message, MAX_BUFFER);
        connections.get(`${auth.teamId}:${target!.name}`)?.(message);
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ ok: true, messageId: message.id, deliveredTo: targets.length }),
          },
        ],
      };
    }
  );

  server.tool(
    'agent_hub_list_agents',
    'List all agents currently connected in your team',
    {},
    async () => {
      const agents = (await store.listAgents(auth.teamId)).map((a) => ({
        name: a.name,
        connectedAt: a.connectedAt,
        pendingMessages: a.messageBuffer.length,
      }));

      return { content: [{ type: 'text' as const, text: JSON.stringify(agents, null, 2) }] };
    }
  );

  server.tool(
    'agent_hub_receive',
    'Retrieve and clear all buffered messages addressed to you',
    {},
    async () => {
      const messages = await store.flushMessages(auth.teamId, auth.agentName);
      return { content: [{ type: 'text' as const, text: JSON.stringify(messages, null, 2) }] };
    }
  );

  server.tool(
    'agent_hub_whoami',
    'Returns your own agent name and team ID.',
    {},
    async () => ({
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ agentName: auth.agentName, teamId: auth.teamId }),
      }],
    })
  );
}
