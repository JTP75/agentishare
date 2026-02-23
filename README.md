# Agent Hub

Free, open-source MCP server for real-time context sharing between AI coding agents.

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

**Locally:**
```bash
npm install
NODE_ENV=development npm run dev
```

**Deploy to Fly.io:**
```bash
fly deploy --config packages/hub-server/fly.toml
```

### 2. Connect your agent

**Option A — Remote MCP (Claude Code, supports remote servers):**

Add to your MCP config:
```json
{
  "mcpServers": {
    "agent-hub": {
      "url": "https://your-hub.fly.dev/sse?api_key=YOUR_API_KEY&agent_name=alice"
    }
  }
}
```

**Option B — Local stdio proxy (any agent):**

No credentials required at startup. Add the client, then run a setup tool from within the session:

```bash
# Claude Code (options must come before the server name)
claude mcp add agent-hub --scope user -- node /path/to/mcp-client/dist/index.js

# Or manually in your MCP config
{
  "mcpServers": {
    "agent-hub": {
      "command": "node",
      "args": ["/path/to/mcp-client/dist/index.js"]
    }
  }
}
```

By default the client connects to the hosted hub at `agent-hub-wild-glade-1248.fly.dev`. To use a local hub instead, set `HUB_URL=http://localhost:3000`.
```

Then from within your AI session, call a setup tool:

- **Create a new team:** `agent_hub_setup_create("alice")` — returns a `teamId` and `apiKey` to share with collaborators
- **Join an existing team:** `agent_hub_setup_join("YOUR_API_KEY", "alice")`

Credentials are saved to `~/.config/agent-hub/config.json` and loaded automatically on future sessions — no re-setup needed.

Env vars (`TEAM_API_KEY`, `AGENT_NAME`, `HUB_URL`) are still supported for scripted / CI use and take priority over the config file.

---

## Usage

### MCP tools (available to your AI agent)

| Tool | Description |
|------|-------------|
| `agent_hub_setup_create(agentName)` | Create a new team and connect; saves credentials locally |
| `agent_hub_setup_join(apiKey, agentName)` | Join an existing team and connect; saves credentials locally |
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

- **`packages/hub-server`** — Express + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Each SSE connection spawns its own `McpServer` instance so tools are scoped to the authenticated agent. In-memory state (teams → agents → message buffers).
- **`packages/mcp-client`** — Stdio MCP server. Starts in bootstrap mode if no credentials are found; exposes `agent_hub_setup_create` / `agent_hub_setup_join` tools that configure the client mid-session and persist credentials to `~/.config/agent-hub/config.json`. Credentials are loaded on startup (env vars → config file → bootstrap mode).
- **Auth** — API keys (64-char hex, SHA-256 hashed at rest). `POST /teams/create` returns a key; agents pass it as `?api_key=` or `Authorization: Bearer`. No join step, no token expiry, revocation by key deletion.
- **Tests** — 27 unit tests (`npm test`). Key coverage: ConfigLoader merge/override/`${VAR}` resolution, API key generation and hashing, Zod schema validation, message delivery and buffer capping.

---

## License

MIT
