# Agent Flow Plugin — OpenCode agent monitor

> **≡ Agent Behavior Rules (loaded as AI instructions)**

## Session Management — ENFORCE ONE SESSION PER CHAT

```plaintext
RULE: Each OpenCode chat = ONE session. NO exceptions.
```

**Builder (root agent) must:**
1. Generate sessionId once: `` `session-${Date.now()}-${random(6)}` ``
   - OR detect OpenCode's native sessionId (from `session.created` event) and use that
2. **Explicitly pass** sessionId to EVERY delegated subagent in the delegation prompt
3. **Log all events** (start/complete/delegation) using THAT sessionId

**Subagents MUST:**
- **NEVER generate their own sessionId.** Always use the parent's.
- Include sessionId in every `POST /api/agent/event` call
- Include `parentSessionId` (the root sessionId) in POST body when logging events to the parent session
- Pass the SAME sessionId to any further sub-subagents

**Enforcement template — delegation prompt MUST include:**
```
IMPORTANT: Use sessionId "${sessionId}" for ALL event logging.
Do NOT generate a new sessionId. This session belongs to the parent chat.
```

**Plugin safety net (since v1.1):** Even if subagents ignore the rule, the plugin auto-groups child sessions under their parent via `parentID` field in SSE events. See `GET /api/session-tree`. This is a fallback, not a replacement for correct behavior.

**Violation:** Subagent that creates own sessionId fragments the dashboard. One chat = one session. Subagents are NOT independent sessions.

---

## Plugin docs follow below

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

### 1. Avvia OpenCode con porta fissa

```bash
opencode --port 4096
```

### 2. Start dashboard

```bash
npx @sferralove/agent-flow-plugin
```

Apri `http://localhost:3001`.

Il collector tenta automaticamente la connessione SSE a `http://127.0.0.1:4096/global/event`:
- **Senza auth** — se OpenCode non richiede password, funziona subito.
- **Con auth** — se OpenCode richiede autenticazione, appare: `Authentication required. Set OPENCODE_SERVER_PASSWORD.`

Il dashboard funziona in ogni caso — gli eventi arrivano anche via `POST /api/agent/event`.

### 3. Se OpenCode richiede autenticazione

```bash
OPENCODE_SERVER_PASSWORD=mypassword opencode --port 4096
OPENCODE_SERVER_PASSWORD=mypassword npx @sferralove/agent-flow-plugin
```

### 3. Environment variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `3001` | Dashboard server port |
| `OPENCODE_SERVER_PASSWORD` | — | Password for OpenCode SSE auth (only if required) |
| `OPENCODE_SERVER_USERNAME` | `opencode` | Username for OpenCode SSE auth |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4096/global/event` | SSE endpoint URL |

## Architecture

```
OpenCode Server :4096 ──SSE──→ collector.ts ──→ PluginStore ──→ .agent-flow/data/*.json
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
