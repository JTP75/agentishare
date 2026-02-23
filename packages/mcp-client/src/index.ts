#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { HubClient } from './hub-client.js';
import { loadConfig, saveConfig } from './config-store.js';

const NOT_CONFIGURED = 'Not configured. Use agent_hub_setup_create or agent_hub_setup_join first.';

const DEFAULT_HUB_URL = 'http://localhost:3000';

// Priority 1: env vars
// Priority 2: config file
// Priority 3: bootstrap mode
const envApiKey = process.env['TEAM_API_KEY'] ?? '';
const envAgentName = process.env['AGENT_NAME'] ?? '';
const envHubUrl = process.env['HUB_URL'] ?? '';

let initialApiKey = envApiKey;
let initialAgentName = envAgentName;
let initialHubUrl = envHubUrl || DEFAULT_HUB_URL;

if (!initialApiKey || !initialAgentName) {
  const stored = loadConfig();
  if (stored) {
    initialApiKey = initialApiKey || stored.apiKey;
    initialAgentName = initialAgentName || stored.agentName;
    initialHubUrl = envHubUrl || stored.hubUrl || DEFAULT_HUB_URL;
  }
}

const hub = new HubClient({
  hubUrl: initialHubUrl,
  apiKey: initialApiKey,
  agentName: initialAgentName,
});

async function main(): Promise<void> {
  if (hub.isConfigured()) {
    hub.connectSSE();
    process.stderr.write(`[agent-hub] Connected as "${initialAgentName}"\n`);
  } else {
    process.stderr.write('[agent-hub] Starting in bootstrap mode — call agent_hub_setup_create or agent_hub_setup_join\n');
  }

  const server = new McpServer({ name: 'agent-hub-client', version: '0.1.0' });

  server.tool(
    'agent_hub_setup_create',
    'Create a new team on the hub, store credentials locally, and connect. Returns { teamId, apiKey, agentName } — share the apiKey with collaborators.',
    {
      agentName: z.string().describe('Your agent name (required)'),
    },
    async ({ agentName }) => {
      if (hub.isConfigured()) {
        const stored = loadConfig();
        return { content: [{ type: 'text' as const, text: JSON.stringify({ alreadyConfigured: true, agentName, teamId: stored?.apiKey ? '(see config file)' : undefined }) }] };
      }

      const hubUrl = envHubUrl || DEFAULT_HUB_URL;
      try {
        const { teamId, apiKey } = await hub.createTeam(hubUrl);
        const cfg = { apiKey, agentName, hubUrl };
        saveConfig(cfg);
        hub.configure(cfg);
        hub.connectSSE();
        process.stderr.write(`[agent-hub] Connected as "${agentName}"\n`);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ teamId, apiKey, agentName }) }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
      }
    }
  );

  server.tool(
    'agent_hub_setup_join',
    'Join an existing team using an API key, store credentials locally, and connect.',
    {
      apiKey: z.string().describe('Team API key to join'),
      agentName: z.string().describe('Your agent name (required)'),
    },
    async ({ apiKey, agentName }) => {
      if (hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ alreadyConfigured: true, agentName }) }] };
      }

      const hubUrl = envHubUrl || DEFAULT_HUB_URL;
      // Verify key by attempting to list agents
      const testHub = new HubClient({ hubUrl, apiKey, agentName });
      try {
        await testHub.listAgents();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Invalid API key or connection error: ${msg}` }] };
      }

      const cfg = { apiKey, agentName, hubUrl };
      saveConfig(cfg);
      hub.configure(cfg);
      hub.connectSSE();
      process.stderr.write(`[agent-hub] Connected as "${agentName}"\n`);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ agentName, hubUrl }) }] };
    }
  );

  server.tool(
    'agent_hub_send',
    'Send a message to another agent or broadcast to all team members',
    {
      to: z.string().describe('Target agent name, or "broadcast" for all'),
      type: z.enum(['api_spec', 'file_change', 'decision', 'todo', 'question']).describe('Message type'),
      content: z.string().describe('Message content (plain text or JSON string)'),
    },
    async ({ to, type, content }) => {
      if (!hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: NOT_CONFIGURED }] };
      }
      const result = await hub.send(to, type, content);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'agent_hub_list_agents',
    'List all agents currently connected in your team',
    {},
    async () => {
      if (!hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: NOT_CONFIGURED }] };
      }
      const agents = await hub.listAgents();
      return { content: [{ type: 'text' as const, text: JSON.stringify(agents, null, 2) }] };
    }
  );

  server.tool(
    'agent_hub_receive',
    'Retrieve and clear all buffered messages addressed to you',
    {},
    async () => {
      if (!hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: NOT_CONFIGURED }] };
      }
      const messages = hub.flushMessages();
      return { content: [{ type: 'text' as const, text: JSON.stringify(messages, null, 2) }] };
    }
  );

  server.tool(
    'agent_hub_whoami',
    'Returns your own agent name and team ID.',
    {},
    async () => {
      if (!hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: NOT_CONFIGURED }] };
      }
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(hub.identity()),
        }],
      };
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
