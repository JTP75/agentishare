import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { state } from '../state.js';
import type { Agent, AgentMessage, AuthToken } from '../types.js';
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
      const team = state.teams.get(auth.teamId);
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

      const targets: Agent[] =
        to === 'broadcast'
          ? [...team.agents.values()].filter((a) => a.name !== auth.agentName)
          : ([team.agents.get(to)].filter(Boolean) as Agent[]);

      for (const target of targets) {
        target.messageBuffer.push(message);
        if (target.messageBuffer.length > MAX_BUFFER) {
          target.messageBuffer.shift();
        }
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
      const team = state.teams.get(auth.teamId);
      if (!team) {
        return { content: [{ type: 'text' as const, text: '[]' }] };
      }

      const agents = [...team.agents.values()].map((a) => ({
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
      const team = state.teams.get(auth.teamId);
      const agent = team?.agents.get(auth.agentName);

      if (!agent) {
        return { content: [{ type: 'text' as const, text: '[]' }] };
      }

      const messages = [...agent.messageBuffer];
      agent.messageBuffer.length = 0;

      return { content: [{ type: 'text' as const, text: JSON.stringify(messages, null, 2) }] };
    }
  );
}
