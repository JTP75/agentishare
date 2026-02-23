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

Agents are organized into **teams** (shared password). Messages are team-scoped; no cross-team visibility.

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
cd packages/hub-server
fly launch --no-deploy
fly secrets set TOKEN_SECRET=$(openssl rand -hex 32)
cd ../..
fly deploy --config packages/hub-server/fly.toml
```

### 2. Connect your agent

**Option A — Remote MCP (Claude Code, supports remote servers):**

Add to your MCP config:
```json
{
  "mcpServers": {
    "agent-hub": {
      "url": "https://your-hub.fly.dev/sse?token=YOUR_TOKEN"
    }
  }
}
```

**Option B — Local stdio proxy (any agent):**
```bash
# Get a token first (see Usage below), then:
TEAM_ID=<id> TEAM_PASSWORD=<pass> AGENT_NAME=alice HUB_URL=https://your-hub.fly.dev \
  npx @agent-hub/mcp-client
```

Add to your MCP config:
```json
{
  "mcpServers": {
    "agent-hub": {
      "command": "npx",
      "args": ["@agent-hub/mcp-client"],
      "env": {
        "TEAM_ID": "<id>",
        "TEAM_PASSWORD": "<pass>",
        "AGENT_NAME": "alice",
        "HUB_URL": "https://your-hub.fly.dev"
      }
    }
  }
}
```

---

## Usage

### Create a team
```bash
curl -X POST https://your-hub.fly.dev/teams/create \
  -H 'Content-Type: application/json' \
  -d '{"password": "yourpassword"}'
# → { "teamId": "550e8400-..." }
```

### Join a team (get a token)
```bash
curl -X POST https://your-hub.fly.dev/teams/join \
  -H 'Content-Type: application/json' \
  -d '{"teamId": "550e8400-...", "agentName": "alice", "password": "yourpassword"}'
# → { "token": "eyJ..." }
```

Share the `teamId` and password with collaborators. Each agent joins with a unique `agentName`.

### MCP tools (available to your AI agent)

| Tool | Description |
|------|-------------|
| `agent_hub_send(to, type, content)` | Send to an agent or `"broadcast"` |
| `agent_hub_list_agents()` | List connected agents in your team |
| `agent_hub_receive()` | Fetch and clear your message buffer |
| `agent_hub_whoami()` | Return your own agent name and team ID |

**Message types:** `api_spec`, `file_change`, `decision`, `todo`, `question`

**Example prompt to your agent:**
> "Send my current API endpoint definitions to bob as an api_spec message."

---

## Configuration

All values live in `config/*.props` — nothing is hardcoded. Edit these to change defaults:

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `server` | `port` | `3000` | Hub listen port |
| `auth` | `token_expiry_seconds` | `86400` | JWT lifetime |
| `rate_limit` | `max_requests` | `100` | Requests per minute |
| `sse` | `max_message_buffer_size` | `100` | Max buffered messages per agent |
| `team` | `max_agents_per_team` | `20` | Max concurrent agents |

Production secrets go in environment variables — `config/config.prod.props` references them as `${TOKEN_SECRET}`.

---

## Implementation

- **`packages/hub-server`** — Express + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Each SSE connection spawns its own `McpServer` instance so tools are scoped to the authenticated agent. In-memory state (teams → agents → message buffers).
- **`packages/mcp-client`** — Stdio MCP server. Joins team on startup, maintains an SSE connection to the hub, buffers incoming messages for `agent_hub_receive`.
- **Auth** — bcrypt team passwords, JWT tokens for SSE connections.
- **Tests** — 35 unit tests (`npm test`). Key coverage: ConfigLoader merge/override/`${VAR}` resolution, auth round-trips, Zod schema validation, message delivery and buffer capping.

---

## License

MIT
