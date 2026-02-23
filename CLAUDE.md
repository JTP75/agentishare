# Agent Hub MCP Server

## Critical Rules

**Never hard-code configuration values in source code.** All configurable values (hosts, ports, credentials, feature flags, etc.) must be defined in `config/*.props` files and accessed via `ConfigLoader`.

## Project Structure

```
agentishare/
├── config/                  # Shared .props config files (base + env overrides)
├── packages/
│   ├── hub-server/          # Express + MCP remote server (TypeScript)
│   │   └── src/
│   │       ├── config/      # TypeScript ConfigLoader + constants
│   │       ├── middleware/  # Auth, rate limiting, validation
│   │       ├── mcp/         # McpServer + tool definitions
│   │       └── routes/      # Express route handlers
│   └── mcp-client/          # Local stdio MCP proxy for agents (TypeScript)
│       └── src/
├── src/config/              # Python ConfigLoader (original template, keep intact)
└── main.py                  # Python entry point (original template, keep intact)
```

## Configuration Usage

### TypeScript (hub-server, mcp-client)

```typescript
import { ConfigLoader, Sections, Keys } from './config/index.js';

const config = new ConfigLoader();        // or new ConfigLoader('dev') / ConfigLoader('prod')
const port = config.get<number>(Sections.SERVER, Keys.PORT, 3000);
```

When adding new configuration:
1. Add the value to `config/config.props`
2. Add the section name to `Sections` class in `packages/hub-server/src/config/constants.ts`
3. Add the key name to `Keys` class in `packages/hub-server/src/config/constants.ts`
4. Access via `ConfigLoader` in your code

### Python (original template)

```python
from src.config import ConfigLoader, Sections, Keys

config = ConfigLoader()  # or ConfigLoader(env="dev")
value = config.get(Sections.SECTION, Keys.KEY)
```

Both ConfigLoaders read the same `config/*.props` files (INI format).

### Environment-specific secrets

Use `${ENV_VAR}` placeholders in `.props` files — the TypeScript `ConfigLoader` resolves them
from `process.env` at runtime. Never put real secrets in committed config files.

```ini
[auth]
token_secret=${TOKEN_SECRET}
```

## Commands

- **Hub server (dev):** `NODE_ENV=development npm run dev` (from repo root)
- **Hub server (prod):** `npm run build && npm start`
- **MCP client:** `TEAM_ID=... TEAM_PASSWORD=... AGENT_NAME=... npm run dev -w packages/mcp-client`
- **Build all:** `npm run build`
- **Python entry point:** `python main.py`

## TypeScript Conventions

- `"module": "Node16"` — all imports must include `.js` extension (e.g., `'./state.js'`)
- Zod for all request body validation — no raw `req.body` access without schema
- `bcryptjs` (not `bcrypt`) — pure JS, no native compilation required
- Each SSE agent connection gets its own `McpServer` instance (tools are auth-scoped)
