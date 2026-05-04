# AGENTS.md

## Project identity

Agent Flow — per-project monitoring tool for OpenCode agent/subagent workflows. Real-time flow graph via MCP tools + WebSocket + React dashboard. HTTP API available as fallback.

## Install & run

```bash
# Install from GitHub
npm install -D github:Sferralove/agentflow

# First time: init + deploy skill
npx agent-flow init

# Start (auto-restart on dist/ changes)
npx agent-flow dev

# Or start without watch
npx agent-flow serve
```

Dashboard opens at `http://localhost:3001`. Everything — API, WS, static files — serves from port 3001.

## Build

```bash
# Full build (tsc → frontend vite → copy to dist/public)
npm run build

# Frontend only (then copy to dist/public)
npm run build:frontend && mkdir -p dist/public && cp -r frontend/dist/* dist/public/
```

Frontend has separate `package.json`, `tsconfig.json`, `vite.config.ts`, and `node_modules/`. Vite dev server runs on port 5173 proxying `/api` and `/ws` to 3001.

## Testing

```bash
npm test              # vitest run — 22 tests, 4 suites, <2s
npm run test:watch    # vitest watch
npx vitest run tests/store.test.ts   # single file
npx vitest run -t "should filter"    # single test
```

WS tests use port 9999 hardcoded — keep it free.

## Architecture

```
src/
├── cli/         Commander.js CLI (init, dev, serve, status, export)
├── mcp/         MCP stdio server + tool handlers
├── ws/          WebSocket server (broadcast, heartbeat)
├── api/         Express REST API on port 3001
├── store/       JSON file-backed event store (one .agent-flow/data/{sessionId}.json per session)
├── types/       Shared TypeScript types
└── server.ts    AgentFlowServer orchestrator — wires store, WS, MCP together

frontend/        React + ReactFlow + Vite (separate package.json, own node_modules)
```

**Key wiring:** `server.ts` monkey-patches `store.addEvent` — broadcasts event via WebSocket immediately, then awaits disk persistence. Reduces real-time latency.

## Storage

`MultiStore` manages one `JsonStore` per session file `.agent-flow/data/{sessionId}.json`. Atomic writes (tmp file + rename). `getAllSessions()` scans data directory for session IDs.

## `init` command — what it does

1. Creates `.agent-flow/config.json` and `.agent-flow/data/`
2. Copies `skills/agent-flow/SKILL.md` → `.opencode/skills/agent-flow/SKILL.md` (auto-discovered by OpenCode)
3. Adds `"agent-flow": "allow"` to `opencode.json` under `permission.skill`
4. Creates `.opencode/instructions/agent-flow.md` (startup instruction to auto-load skill)
5. Appends that instruction file path to `opencode.json` `instructions` array
6. Strips `$schema` from `opencode.json` on write (causes upgrade errors)

`serve` requires prior `init` — checks for `.agent-flow/data` directory.

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent/event` | POST | Agents log events |
| `/api/events` | GET | All events |
| `/api/sessions` | GET | Session IDs |
| `/api/sessions/:id` | GET | Full session (agents + events) |
| `/api/agents/:id` | GET | Single agent metadata |

`POST /api/agent/event` body: `{ type, agent, sessionId, targetAgent?, payload?, ...extra }`. Uses `delegation` → `dispatch` backward compat mapping. Extra unknown fields merged into `payload`.

## Event types

`start` | `complete` | `dispatch` | `task` | `error` | `message`

`dispatch` events create parent/child relationships (`AgentInfo.children`, `AgentInfo.parentId`).

## Data flow

1. Agent calls MCP tool `send_event` (stdio, primary) or `POST /api/agent/event` (HTTP, fallback)
2. Handler writes event to `JsonStore` via `MultiStore`
3. Monkey-patched `addEvent` broadcasts via WebSocket immediately, then persists to disk
4. Frontend React dashboard receives WS events, renders flow graph in real time

## Project conventions

- **tsconfig** strict mode, target ES2022, module commonjs, rootDir=src, outDir=dist
- **TypeScript only** — no Babel, no JS files in src
- **No eslint config exists** despite `"lint": "eslint src/"` in scripts. Run manually if needed
- **Tailwind CSS v4** — frontend uses `@tailwindcss/vite` plugin. Entry: `frontend/src/styles/index.css`
- **Types duplicated** — `src/types/index.ts` and `frontend/src/types.ts` are identical. Keep them in sync
- **zod is transitive** — comes through `@modelcontextprotocol/sdk`, not in root `package.json`
- **dist/ committed** — for direct GitHub install via `npm install -D github:Sferralove/agentflow`

## Gotchas

- `serve` requires prior `init` (checks `.agent-flow/data`)
- MCP server starts in background (fire-and-forget) — stdio transport blocks process
- WS reconnection: frontend `useWebSocket` hook auto-reconnects with exponential backoff (500ms base, max 8s)
- `JsonStore` loads entire file synchronously into memory — not for very large histories
- `getSession()` returns `agents: Map<string, AgentInfo>` — Map type, not plain object
- `opencode.json` project overlay must NOT include `$schema` — `init` strips it
- `@modelcontextprotocol/sdk` is a runtime dependency (used by MCP server), not just dev
