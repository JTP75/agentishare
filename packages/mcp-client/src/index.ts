#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { ITransport } from './transport.js';
import { HubClient } from './hub-client.js';
import { NostrClient } from './nostr-client.js';
import { loadConfig, saveConfig, clearConfig } from './config-store.js';
import type { StoredConfig } from './config-store.js';
import { getConfig } from './config.js';

const NOT_CONFIGURED = 'Not configured. Use agent_hub_setup_create or agent_hub_setup_join first.';

// Defaults sourced from config/config.props (falls back to literals when config not present,
// e.g. when installed globally via npm).
const DEFAULT_HUB_URL  = getConfig('hub',   'default_url',       'https://agent-hub-wild-glade-1248.fly.dev');
const DEFAULT_RELAY_URL = getConfig('nostr', 'relay_url',         'wss://nos.lol');
const DEFAULT_HEARTBEAT_MS     = getConfig<number>('nostr', 'heartbeat_ms',     60_000);
const DEFAULT_PRESENCE_WINDOW_S = getConfig<number>('nostr', 'presence_window_s', 90);

// Priority 1: env vars
// Priority 2: config file
// Priority 3: bootstrap mode
const envApiKey    = process.env['TEAM_API_KEY'] ?? '';
const envAgentName = process.env['AGENT_NAME']   ?? '';
const envHubUrl    = process.env['HUB_URL']      ?? '';
const envTransport = process.env['TRANSPORT']    ?? '';

const stored = loadConfig();
const transportType = envTransport || stored?.transport || 'nostr';

let initialApiKey   = envApiKey    || stored?.apiKey    || '';
let initialAgentName = envAgentName || stored?.agentName || '';

let hub: ITransport;

if (transportType === 'nostr') {
  const relayUrl = envHubUrl || stored?.hubUrl || DEFAULT_RELAY_URL;
  hub = new NostrClient({
    relayUrl,
    agentName: initialAgentName,
    teamId: initialApiKey || undefined,
    privateKey: stored?.privateKey,
    heartbeatMs: DEFAULT_HEARTBEAT_MS,
    presenceWindowS: DEFAULT_PRESENCE_WINDOW_S,
  });
} else {
  const hubUrl = envHubUrl || stored?.hubUrl || DEFAULT_HUB_URL;
  hub = new HubClient({ hubUrl, apiKey: initialApiKey, agentName: initialAgentName });
}

async function main(): Promise<void> {
  if (hub.isConfigured()) {
    hub.connect();
    process.stderr.write(`[agent-hub] Connected as "${initialAgentName}" (transport: ${transportType})\n`);
  } else {
    process.stderr.write('[agent-hub] Starting in bootstrap mode — call agent_hub_setup_create or agent_hub_setup_join\n');
  }

  const server = new McpServer({ name: 'agent-hub-client', version: '0.1.0' });

  server.tool(
    'agent_hub_setup_create',
    'Create a new team on the hub, store credentials locally, and connect. Returns { teamId, apiKey, agentName } — share the apiKey with collaborators. IMPORTANT: before calling this tool, ask the user what agent name they want to use. Do not invent a name.',
    {
      agentName: z.string().describe('The agent name chosen by the user — you must ask the user for this before calling the tool'),
    },
    async ({ agentName }) => {
      if (hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ alreadyConfigured: true, agentName }) }] };
      }

      try {
        if (transportType === 'nostr') {
          const relayUrl = envHubUrl || stored?.hubUrl || DEFAULT_RELAY_URL;
          hub.configure({ relayUrl, agentName });
          const { teamId, apiKey } = await hub.createTeam();
          saveConfig(hub.exportConfig() as unknown as StoredConfig);
          hub.connect();
          process.stderr.write(`[agent-hub] Connected as "${agentName}" (nostr)\n`);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ teamId, apiKey, agentName }) }] };
        } else {
          const hubUrl = envHubUrl || stored?.hubUrl || DEFAULT_HUB_URL;
          hub.configure({ hubUrl, apiKey: '', agentName });
          const { teamId, apiKey } = await hub.createTeam();
          hub.configure({ hubUrl, apiKey, agentName });
          saveConfig(hub.exportConfig() as unknown as StoredConfig);
          hub.connect();
          process.stderr.write(`[agent-hub] Connected as "${agentName}"\n`);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ teamId, apiKey, agentName }) }] };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
      }
    }
  );

  server.tool(
    'agent_hub_setup_join',
    'Join an existing team using an API key, store credentials locally, and connect. IMPORTANT: before calling this tool, ask the user what agent name they want to use. Do not invent a name.',
    {
      apiKey: z.string().describe('Team API key to join'),
      agentName: z.string().describe('The agent name chosen by the user — you must ask the user for this before calling the tool'),
    },
    async ({ apiKey, agentName }) => {
      if (hub.isConfigured()) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ alreadyConfigured: true, agentName }) }] };
      }

      try {
        if (transportType === 'nostr') {
          // Nostr is permissionless — the teamId IS the apiKey, no server to verify against
          const relayUrl = envHubUrl || stored?.hubUrl || DEFAULT_RELAY_URL;
          hub.configure({ relayUrl, agentName, teamId: apiKey, privateKey: stored?.privateKey });
          saveConfig(hub.exportConfig() as unknown as StoredConfig);
          hub.connect();
          process.stderr.write(`[agent-hub] Connected as "${agentName}" (nostr)\n`);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ agentName, relayUrl }) }] };
        } else {
          const hubUrl = envHubUrl || stored?.hubUrl || DEFAULT_HUB_URL;
          // Verify key by attempting to list agents
          hub.configure({ hubUrl, apiKey, agentName });
          try {
            await hub.listAgents();
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { content: [{ type: 'text' as const, text: `Invalid API key or connection error: ${msg}` }] };
          }
          saveConfig(hub.exportConfig() as unknown as StoredConfig);
          hub.connect();
          process.stderr.write(`[agent-hub] Connected as "${agentName}"\n`);
          return { content: [{ type: 'text' as const, text: JSON.stringify({ agentName, hubUrl }) }] };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: 'text' as const, text: `Error: ${msg}` }] };
      }
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

  server.tool(
    'agent_hub_reset',
    'Disconnect from the current team and erase stored credentials for this workspace. The Nostr private key is discarded (fresh identity on next setup). Restart the MCP server after reset before calling setup_create or setup_join.',
    {},
    async () => {
      const warnings: string[] = [];
      if (envApiKey || envAgentName) {
        warnings.push('WARNING: credentials are also present in environment variables (TEAM_API_KEY / AGENT_NAME). Those will override the config file on next restart — unset them to fully reset.');
      }

      hub.close();
      clearConfig();

      const msg = [
        'Reset complete. Stored credentials for this workspace have been cleared.',
        ...warnings,
        'Restart the MCP server, then call agent_hub_setup_create or agent_hub_setup_join.',
      ].join('\n');

      return { content: [{ type: 'text' as const, text: msg }] };
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
