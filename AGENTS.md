# AGENTS.md

## Project identity

Agent Flow — per-project monitoring tool for OpenCode agent/subagent workflows. Real-time flow graph via MCP + WebSocket + React dashboard.

## Build & run

```bash
# Full build (backend tsc → frontend vite → copy to dist/public)
npm run build

# Backend only (tsc)
npx tsc

# Frontend only
npm run build:frontend

# Start server (dashboard :3000, WS :3001, MCP via stdio)
node dist/cli/index.js serve

# Dev mode (tsc --watch)
npm run dev
```

**Build order matters.** `npm run build` runs tsc first, then frontend build, then copies `frontend/dist/*` → `dist/public/`. If you change frontend code, run `npm run build:frontend && mkdir -p dist/public && cp -r frontend/dist/* dist/public/`.

## Testing

```bash
# All tests (fast, no external deps)
npm test                    # vitest run

# Watch mode
npm run test:watch          # vitest

# Single file
npx vitest run tests/store.test.ts

# Single test
npx vitest run -t "should filter"
```

All 22 tests pass in under 2s. WS tests use port 9999 — ensure nothing else is on that port.

## Architecture

```
src/
├── cli/         Commander.js CLI (init, serve, status, export)
├── mcp/         MCP stdio server + tool handlers
├── ws/          WebSocket server (broadcast, heartbeat, port 3001)
├── api/         Express REST API (port 3000, /api/events, /api/sessions)
├── store/       JSON file-backed event store (.agent-flow/data/{sessionId}.json per session)
├── types/       Shared TypeScript types
└── server.ts    Orchestrator — wires store, WS, MCP together

frontend/        React + ReactFlow + Vite (separate package.json, own node_modules)
```

**Key wiring:** `server.ts` monkey-patches `store.addEvent` to call `wsServer.broadcast(event)` after every event write. The orchestrator is `AgentFlowServer`, instantiated by `cli/serve.ts`.

## Integration (two ways)

### HTTP API (recommended)
Agents log via `POST /api/agent/event`:
```bash
curl -X POST http://localhost:3001/api/agent/event \
  -H 'Content-Type: application/json' \
  -d '{"type":"start","agent":"builder","sessionId":"session-123"}'
```
Agent prompts use `fetch()` — no MCP config needed.

### MCP (via stdio)
Agents call `send_event` MCP tool. Configure in OpenCode MCP settings (if supported).

## Data flow

1. Agents call `POST /api/agent/event` (HTTP) or MCP tool `send_event` (stdio)
2. Handler writes event to `JsonStore` (atomic write via tmp file + rename)
3. Monkey-patched `addEvent` triggers WS broadcast to all connected frontend clients
4. Frontend React dashboard receives WS events and renders flow graph in real time

## Port conventions

| Service      | Port | Notes                                |
|--------------|------|--------------------------------------|
| All-in-one   | 3001 | Dashboard + API + WebSocket          |
| (legacy)     | 3000 | Previously separate dashboard port   |

Single HTTP server on port 3001 handles Express routes, static files, AND WebSocket upgrades. Configurable via `serve --port`. MCP uses stdio (no port).

## API endpoints

`POST /api/agent/event` — agents log events (body: type, agent, sessionId, targetAgent?, payload?)
`GET /api/events` — all events
`GET /api/sessions` — session IDs
`GET /api/sessions/:id` — full session with agents and events
`GET /api/agents/:id` — single agent metadata

## MCP tools exposed

- `send_event` — agents log events (type, agent, sessionId, targetAgent, payload)
- `query_events` — filter by agent, type, sessionId, time range
- `get_session` — full session data
- `get_agent_info` — single agent metadata
- `get_agent_tree` — agent hierarchy with events per node

## Event types

`start` | `complete` | `dispatch` | `task` | `error` | `message`

`dispatch` events create parent/child relationships (`AgentInfo.children`, `AgentInfo.parentId`).

## Project conventions

- **tsconfig** strict mode, target ES2022, module commonjs, rootDir=src, outDir=dist
- **TypeScript only** — no Babel, no JS files in src
- **No eslint config exists** despite `"lint": "eslint src/"` in scripts. Run linting manually if needed.
- **No root .gitignore** — `dist/` and `node_modules/` are simply not tracked by git
- **Frontend has separate config** — its own `package.json`, `tsconfig.json`, `vite.config.ts`, and `node_modules/`. Its `.gitignore` covers its own `dist/` and `node_modules/`.
- **Tailwind CSS v4** — configured via `@tailwindcss/vite` plugin in `vite.config.ts`. Entry point: `frontend/src/styles/index.css` (imported in `main.tsx`). No separate config file needed.
- **Types duplicated** — `src/types/index.ts` and `frontend/src/types.ts` contain identical type definitions. Keep them in sync.
- **zod is transitive** — MCP tools use `z` from `zod`, but it's not in root `package.json`. It comes through `@modelcontextprotocol/sdk`.
- **Store persistence** — atomic writes: write to `.tmp` file, then `rename` to target. No corruption on crash.

## Running the dev server

```bash
npx agent-flow init    # Creates .agent-flow/config.json
npx agent-flow serve   # Starts Dashboard :3000, WS :3001, MCP stdio
```

The `init` command does NOT modify OpenCode config files — it only creates `.agent-flow/` directory. The MCP server must be configured manually in OpenCode.

## Edge cases & gotchas

- `serve` command requires prior `init` (checks for `.agent-flow/data` directory)
- MCP server starts in background (fire-and-forget via `.catch(console.error)`) because stdio transport blocks the process
- WS reconnection: frontend `useWebSocket` hook auto-reconnects after 3s on disconnect
- WS tests use port 9999 hardcoded — avoid port conflicts in CI
- `JsonStore` constructor loads entire file synchronously into memory — not suitable for very large event histories
- `getSession()` returns `agents: Map<string, AgentInfo>` — note Map type, not plain object
- **Session-scoped storage** — `MultiStore` manages one `JsonStore` per session file (`{sessionId}.json`). `getAllSessions()` scans the data directory.
