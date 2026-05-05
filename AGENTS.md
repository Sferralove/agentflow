# Agent Flow Plugin — OpenCode agent monitor

Automatic agent/subagent activity monitor + real-time React dashboard. Reads OpenCode SSE event stream — **zero agent cooperation needed**. No hooks, no plugin loading inside OpenCode.

## Build

```bash
npm install
npm run build    # tsc + vite (dashboard)
```

**Build output:**
- `dist/` — compiled JS (entry: `dist/start-dashboard.js`)
- `dist/dashboard/` — static React dashboard (served by dashboard server at runtime)

## Usage

### 1. Start dashboard

```bash
npx @sferralove/agent-flow-plugin
```

Apri `http://localhost:3001`.

### 2. Enable SSE collector (automatic events)

```bash
OPENCODE_SERVER_PASSWORD=<your-password> npx @sferralove/agent-flow-plugin
```

Il collector si connette a `http://127.0.0.1:4101/global/event` e legge TUTTI gli eventi OpenCode in tempo reale. Riconnessione automatica con backoff esponenziale (1s → 30s).

Senza password, solo gli eventi POSTati via `/api/agent/event` sono visibili.

### 3. Environment variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `3001` | Dashboard server port |
| `OPENCODE_SERVER_PASSWORD` | — | Password for OpenCode SSE auth |
| `OPENCODE_SERVER_USERNAME` | `opencode` | Username for OpenCode SSE auth |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4101/global/event` | SSE endpoint URL |

## Architecture

```
OpenCode Server :4101 ──SSE──→ collector.ts ──→ PluginStore ──→ .agent-flow/data/*.json
       (zero agent coop)            │                    │
                                    ▼                    ▼
                              WebSocket            REST API :3001
                                    │                    │
                                    └──── Dashboard ◄────┘
```

- **SSE Collector** (`dist/collector.js`) — primary event source. Connects to OpenCode event stream, no agent modification needed.
- **PluginStore** (`dist/store/index.js`) — single writer, atomic JSON persistence.
- **Dashboard Server** (`dist/server.js`) — Express + WebSocket, localhost-only.

## REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | `{ sessions: string[] }` |
| `GET /api/events/:sessionId` | `{ events: AgentEvent[] }` |
| `POST /api/agent/event` | Accept event from agent: `{ agent, type, sessionId, payload }` |

## WebSocket

Connect to `ws://localhost:3001`:

```
→ { "type": "subscribe", "sessionId": "..." }
← { "type": "event", "event": { ... } }
← { "type": "sessionList", "sessions": [...] }
```

## Event types logged

`start` | `complete` | `dispatch` | `task` | `error` | `message`

Each event written atomically (tmp file + rename) to `.agent-flow/data/{sessionId}.json`.

## Dashboard

`http://localhost:3001` mostra:

- **Flow Graph** — reactflow canvas showing agents as nodes, dispatch delegations as edges
- **Timeline** — real-time scrollable event list, color-coded by type
- **Session selector** — switch between monitored sessions via dropdown or `?session=` URL param

## Gotchas

- **Runtime deps:** `express`, `ws` — required by dashboard server, installed via `npm install`
- **Storage:** local JSON files only — no external database
- **Atomic writes:** `writeFileSync` to `.tmp` then `renameSync` — safe against partial writes
- **Port conflict:** if port 3001 is in use, dashboard server logs error but monitoring continues unaffected
- **SSE reconnection:** exponential backoff 1s → 30s on connection loss
- **Event cap:** dashboard keeps max 1000 events in memory, older events still on disk
- **Localhost only:** all endpoints reject non-localhost requests
