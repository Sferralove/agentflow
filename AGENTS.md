# AGENTS.md

## Project identity

Agent Flow — per-project monitoring tool for OpenCode agent/subagent workflows.
Two deployment modes:

| Mode | Where | How it works |
|------|-------|-------------|
| **Plugin** | `plugin/` | Hooks into OpenCode events — automatic, zero agent cooperation |
| **Server** | `server/` | Dashboard, CLI, MCP server, HTTP API, skill deployment |

Both share the same storage format (`.agent-flow/data/{sessionId}.json`) and dashboard (ReactFlow on :3001).

## Monorepo structure

```
agent-flow/
├── package.json              # npm workspaces root
├── plugin/                   # @agent-flow/plugin (auto-monitoring)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts          # AgentFlowPlugin export
│       ├── hooks/            # session, tool, message hooks
│       ├── store/            # writes .agent-flow/data/
│       └── tools/            # agentflow_events, _sessions, _stats
├── server/                   # agent-flow server (dashboard, CLI, MCP)
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── cli/              # init, dev, serve, status, export
│   │   ├── api/              # Express REST
│   │   ├── ws/               # WebSocket broadcast
│   │   ├── mcp/              # MCP stdio server
│   │   ├── store/            # MultiStore, JsonStore
│   │   └── types/
│   ├── frontend/             # React + ReactFlow dashboard
│   ├── skills/               # agent-flow SKILL.md
│   └── tests/                # 22 tests, 4 suites
└── .gitignore
```

## Plugin mode

```bash
# 1. Add to opencode.json
{ "plugin": ["agent-flow-plugin"] }

# 2. Start dashboard (from server package)
npx agent-flow serve

# Done. Everything auto-logged.
```

**How it works:** The plugin hooks into `session.created`, `tool.execute.before/after`, `message.updated` — capturing ALL agent activity without agents needing to know. Writes to `.agent-flow/data/` for the existing dashboard.

## Server mode (Skill + MCP)

```bash
npm install -D github:Sferralove/agentflow
npx agent-flow init
npx agent-flow serve
```

## Build

```bash
# From root (via workspaces)
npm run build

# Server only
npm run build -w server

# Plugin only
npm run build -w plugin
```

## Testing

```bash
npm test              # 22 tests, 4 suites, <2s
npm run test -w server
```

## Project conventions

- **tsconfig** strict mode, target ES2022, module commonjs (server) / ES2022 (plugin)
- **TypeScript only** — no Babel, no JS files in src
- **Tailwind CSS v4** — frontend uses `@tailwindcss/vite` plugin
- **Types duplicated** — `server/src/types/index.ts` and `server/frontend/src/types.ts` are identical
- **dist/ committed** — for direct GitHub install via `npm install -D github:Sferralove/agentflow`

## Gotchas

- `serve` requires prior `init` (checks `.agent-flow/data`)
- MCP server starts via `agent-flow-mcp` standalone binary — not in serve process
- WS reconnection: frontend `useWebSocket` hook auto-reconnects with exponential backoff
- `JsonStore` loads entire file synchronously into memory — not for very large histories
- `getSession()` returns `agents: Map<string, AgentInfo>` — Map type, not plain object
- `opencode.json` project overlay must NOT include `$schema` — `init` strips it
