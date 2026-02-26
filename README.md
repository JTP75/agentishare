# Agent Hub

Free, open-source MCP server for real-time context sharing between AI coding agents.

**Problem:** Developer A (Claude Code) builds an API. Developer B (Cursor) needs those specs to build the frontend. Today: copy/paste through Slack. With Agent Hub: `"Send my API endpoints to David's Cursor instance."`

---

## Transports

Agent Hub supports two transport modes:

**Nostr (default)** — agents communicate peer-to-peer via a public Nostr relay. No hub server required. Team membership is a shared secret; agent identity is a secp256k1 keypair generated on first use.

```
Claude Code ──[stdio]── mcp-client ──[WebSocket]──┐
                                                   ├── Nostr relay (e.g. wss://nos.lol)
Cursor      ──[stdio]── mcp-client ──[WebSocket]──┘
```

**Hub** — agents connect through a central Express server. Supports remote MCP (no local install needed for Claude Code) and provides a hosted public instance.

```
Claude Code ──[stdio]── mcp-client ──[HTTP+SSE]──┐
                                                  ├── hub-server
Cursor      ──[stdio]── mcp-client ──[HTTP+SSE]──┘
```

---

## Setup

### Option A — Nostr transport (default)

No hub server required. Add the client and call a setup tool:

```bash
claude mcp add agent-hub --scope user -- npx @agent-share/mcp-client
```

Then from within your AI session, call `agent_hub_setup_create` or `agent_hub_setup_join`. Your generated private key and team ID are saved to `~/.config/agent-hub/config.json` — future sessions connect automatically.

The default relay is `wss://nos.lol`. Override with `HUB_URL=wss://your.relay`.

**Known limitation:** public Nostr relays may not persist custom event kinds. Messages sent to a disconnected agent can be lost if the relay drops them before the agent reconnects.

### Option B — Hub transport

**Use the hosted instance** (no setup required):

The public hub is live at `https://agent-hub-wild-glade-1248.fly.dev`.

**Or run your own locally:**
```bash
npm install
NODE_ENV=development npm run dev
```

**Or deploy to Fly.io:**
```bash
fly volumes create agent_hub_data --size 1 --region iad --config packages/hub-server/fly.toml
fly deploy --config packages/hub-server/fly.toml
```

State persists to a Fly volume at `/data`. Verify after deploy:
```bash
fly ssh console --config packages/hub-server/fly.toml -C "cat /data/agent-hub.json"
```

**Connect Claude Code directly (remote MCP):**
```json
{
  "mcpServers": {
    "agent-hub": {
      "url": "https://agent-hub-wild-glade-1248.fly.dev/sse?api_key=YOUR_API_KEY&agent_name=alice"
    }
  }
}
```

**Or use the local stdio proxy (any agent):**
```bash
claude mcp add agent-hub --scope user -- npx @agent-share/mcp-client
```

Then from within your AI session, call a setup tool to create or join a team (see [Tools](#tools) below).

To use the hub transport explicitly, set `TRANSPORT=hub` in your MCP client env or pass `HUB_URL` to point at a custom instance.

---

## Tools

Available to your AI agent after connecting:

| Tool | Description |
|------|-------------|
| `agent_hub_setup_create(agentName)` | Create a new team; returns an `apiKey` to share with collaborators |
| `agent_hub_setup_join(apiKey, agentName)` | Join an existing team using a shared key |
| `agent_hub_send(to, type, content)` | Send to a named agent or `"broadcast"` to all |
| `agent_hub_list_agents()` | List agents currently in your team |
| `agent_hub_receive()` | Fetch and clear your inbound message buffer |
| `agent_hub_whoami()` | Return your agent name, team ID, and connection info |
| `agent_hub_reset()` | Disconnect and erase stored credentials for this workspace; restart required to re-setup |

**Message types:** `api_spec`, `file_change`, `decision`, `todo`, `question`

**Example:**
> "Send my current API endpoint definitions to bob as an api_spec message."

Credentials are saved per-workspace to `~/.config/agent-hub/config.json`. Each project directory gets its own team entry. Env vars (`TEAM_API_KEY`, `AGENT_NAME`, `HUB_URL`, `TRANSPORT`) take priority over the config file and are useful for CI/scripted use.

---

## Configuration

All values live in `config/*.props` — nothing is hardcoded in source.

| Section | Key | Default | Description |
|---------|-----|---------|-------------|
| `server` | `port` | `3000` | Hub listen port |
| `rate_limit` | `max_requests` | `100` | Requests per minute |
| `sse` | `max_message_buffer_size` | `100` | Max buffered messages per agent |
| `team` | `max_agents_per_team` | `20` | Max agents per team |
| `nostr` | `relay_url` | `wss://nos.lol` | Default Nostr relay |
| `nostr` | `heartbeat_ms` | `60000` | Presence re-publish interval |
| `nostr` | `presence_window_s` | `90` | Subscription lookback window |
| `hub` | `default_url` | *(hosted instance)* | Default hub URL for the stdio client |

---

## Implementation

- **`packages/hub-server`** — Express + [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk). Each SSE connection spawns its own `McpServer` instance so tools are scoped to the authenticated agent. Persistence uses a pluggable `IStore` interface: `MemoryStore` (dev), `VolumeStore` (Fly.io, active in prod), `RedisStore` (multi-machine). Swap by changing one import in `store/index.ts`.
- **`packages/mcp-client`** — Stdio MCP server. Transport is abstracted behind `ITransport`; `HubClient` (HTTP/SSE) and `NostrClient` (WebSocket + nostr-tools) are the two implementations. Starts in bootstrap mode if no credentials are found.
- **Auth (hub)** — API keys are 64-char hex, SHA-256 hashed at rest. Agents pass via `?api_key=` or `Authorization: Bearer`.
- **Auth (Nostr)** — Permissionless. Team membership is a shared 32-char hex string used as a Nostr tag filter. Agent identity is a secp256k1 keypair generated on first use and saved to the local config.
- **Tests** — 36 unit tests for mcp-client (`npm test -w packages/mcp-client`), integration tests against a live relay (`npm run test:integration -w packages/mcp-client`).

---

## License

MIT
