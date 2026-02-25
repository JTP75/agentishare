# Agent Hub

Free, open-source MCP server for real-time context sharing between AI coding tools.

**Problem:** Developer A (Claude Code) builds an API. Developer B (Cursor) needs those specs to build the frontend. Today: copy/paste through Slack. With Agent Hub: `"Send my API endpoints to David's Cursor instance."`

---

## How it works

```
Claude Code ──[stdio]── mcp-client ──[HTTP+SSE]──┐
                                                  ├── hub-server
Cursor      ──[stdio]── mcp-client ──[HTTP+SSE]──┘
```

The **hub server** is a central Express server that also speaks MCP over SSE — Claude Code can connect to it directly as a remote MCP server. The **mcp-client** package is a local stdio proxy for agents that don't support remote MCP.

Agents are organized into **teams** (shared API key). Messages are team-scoped; no cross-team visibility.

---

## Setup

### 1. Run the hub server

**Use the hosted instance** (no setup required — skip to step 2):

The public hub is live at `https://agent-hub-wild-glade-1248.fly.dev`. Teams and credentials persist across restarts.

**Or run your own locally:**
```bash
npm install
NODE_ENV=development npm run dev
```

**Or deploy your own to Fly.io:**
```bash
# First deploy
fly volumes create agent_hub_data --size 1 --region iad --config packages/hub-server/fly.toml
fly deploy --config packages/hub-server/fly.toml

# Subsequent deploys
fly deploy --config packages/hub-server/fly.toml
```

State is persisted to a Fly volume mounted at `/data`. To verify after deploy:
```bash
fly ssh console --config packages/hub-server/fly.toml -C "cat /data/agent-hub.json"
```

### 2. Connect your agent

No credentials required at startup. Add the client, then run a setup tool from within the session:

```bash
# Claude Code (options must come before the server name)
claude mcp add agent-hub --scope user -- npx @agent-share/mcp-client
```

```json
{
  "mcpServers": {
    "agent-hub": {
      "command": "npx",
      "args": ["@agent-share/mcp-client"]
    }
  }
}
```

By default the client connects to the hosted hub. To use a local hub instead, set `HUB_URL=http://localhost:3000`.

Then from within your AI session, call a setup tool:

- **Create a new team:** `agent_hub_setup_create("alice")` — returns an `apiKey` to share with collaborators
- **Join an existing team:** `agent_hub_setup_join("YOUR_API_KEY", "alice")`

Credentials are saved per-workspace to `~/.config/agent-hub/config.json` and loaded automatically on future sessions. Each project directory gets its own team entry, so you can belong to multiple independent teams across different workspaces.

Env vars (`TEAM_API_KEY`, `AGENT_NAME`, `HUB_URL`) are still supported for scripted / CI use and take priority over the config file.

---

## Usage

### MCP tools (available to your AI agent)

| Tool | Description |
|------|-------------|
| `agent_hub_setup_create(agentName)` | Create a new team and connect; saves credentials for this workspace |
| `agent_hub_setup_join(apiKey, agentName)` | Join an existing team and connect; saves credentials for this workspace |
| `agent_hub_send(to, type, content)` | Send to an agent or `"broadcast"` |
| `agent_hub_list_agents()` | List connected agents in your team |
| `agent_hub_receive()` | Fetch and clear your message buffer |
| `agent_hub_whoami()` | Return your own agent name and hub URL |

**Message types:** `api_spec`, `file_change`, `decision`, `todo`, `question`

**Example prompt to your agent:**
> "Send my current API endpoint definitions to bob as an api_spec message."

---

## Configuration

All values live in `config/*.props` — nothing is hardcoded. Edit these to change defaults:

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `server` | `port` | `3000` | Hub listen port |
| `rate_limit` | `max_requests` | `100` | Requests per minute |
| `sse` | `max_message_buffer_size` | `100` | Max buffered messages per agent |
| `team` | `max_agents_per_team` | `20` | Max concurrent agents |

---

## Implementation

- **`packages/hub-server`** — Express + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Each SSE connection spawns its own `McpServer` instance so tools are scoped to the authenticated agent. Persistence is handled via a pluggable `IStore` interface with three adapters: `MemoryStore` (development), `VolumeStore` (Fly.io persistent disk, active in production), and `RedisStore` (available for multi-machine deployments). Swap the active backend by changing one import in `store/index.ts`.
- **`packages/mcp-client`** — Stdio MCP server. Starts in bootstrap mode if no credentials are found; exposes `agent_hub_setup_create` / `agent_hub_setup_join` tools that configure the client mid-session and persist credentials to `~/.config/agent-hub/config.json` keyed by workspace path.
- **Auth** — API keys (64-char hex, SHA-256 hashed at rest). `POST /teams/create` returns a key; agents pass it as `?api_key=` or `Authorization: Bearer`.
- **Tests** — 72 unit tests (`npm test`). Key coverage: all three store adapters (contract-tested against a shared suite), ConfigLoader, API key hashing, Zod schema validation.

---

## License

MIT
