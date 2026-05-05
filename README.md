# Agent Flow Plugin

<p align="center">
  <img src="https://img.shields.io/npm/v/@sferralove/agent-flow-plugin?color=emerald" alt="npm version" />
  <img src="https://img.shields.io/github/actions/workflow/status/angelosferra/agent-flow-plugin/ci.yml?branch=main" alt="CI" />
  <img src="https://img.shields.io/node/v/@sferralove/agent-flow-plugin" alt="node" />
  <img src="https://img.shields.io/npm/l/@sferralove/agent-flow-plugin" alt="license" />
</p>

> **Zero-touch agent monitoring & real-time flow visualization for OpenCode.**
>
> Reads OpenCode's SSE event stream — agents don't need to know they're being watched.
> No plugin hooks. No runtime dependency. Just a standalone server + collector.

---

## What it does

Agent Flow reads every event from OpenCode's internal event bus via SSE, stores them to disk,
and streams them in real-time via WebSocket to a React dashboard.

| Capability | Detail |
|---|---|
| 📡 **Passive monitoring** | Zero agent cooperation. Reads OpenCode event stream at `:4101/global/event`. |
| 🧭 **Flow graph** | Interactive canvas showing agents as nodes, delegations as edges, powered by [xyflow](https://xyflow.com). |
| ⏱️ **Live timeline** | Scrollable event feed, color-coded by type, updates in real-time. |
| 📊 **Stats bar** | Event counts by type, error rate, connection status — at a glance. |
| 🔌 **POST API** | Agents can push events manually via `POST /api/agent/event`. |
| 🔒 **Localhost only** | Dashboard server rejects all external connections. Your data never leaves the machine. |
| 💾 **Atomic writes** | Events written to `.tmp` then `rename`d — safe against crashes and partial writes. |
| 🔄 **Auto-reconnect** | SSE collector retries with exponential backoff (1s → 30s) on connection loss. |

---

## Quick start

```bash
# Basic (no automatic events — dashboard only)
npx @sferralove/agent-flow-plugin

# Full (with SSE collector — reads ALL OpenCode events)
OPENCODE_SERVER_PASSWORD=your-password npx @sferralove/agent-flow-plugin
```

Open **`http://localhost:3001`**.

---

## How it works

```
OpenCode Server :4101 ──SSE──→ collector.ts ──→ PluginStore ──→ .agent-flow/data/*.json
       (zero agent coop)            │                    │
                                    ▼                    ▼
                              WebSocket            REST API :3001
                                    │                    │
                                    └──── Dashboard ◄────┘
```

1. **SSE Collector** connects to OpenCode's `/global/event` endpoint and reads every event.
2. **PluginStore** writes events atomically to `.agent-flow/data/{sessionId}.json`.
3. **Dashboard Server** serves the React UI, exposes REST API, and broadcasts via WebSocket.

No plugin loaded inside OpenCode. No agent hooks. No `@opencode-ai/plugin`.

---

## Environment variables

| Var | Default | Description |
|-----|---------|-------------|
| `PORT` | `3001` | Dashboard server port |
| `OPENCODE_SERVER_PASSWORD` | — | Password for OpenCode SSE auth (required for automatic events) |
| `OPENCODE_SERVER_USERNAME` | `opencode` | Username for OpenCode SSE auth |
| `OPENCODE_SERVER_URL` | `http://127.0.0.1:4101/global/event` | SSE endpoint URL |

---

## Dashboard

`http://localhost:3001` shows:

- **Flow Graph** — left panel: agents as nodes, dispatch delegations as edges
- **Timeline** — right panel: scrollable event log, color-coded by type
- **Session selector** — top bar: switch sessions via dropdown or `?session=` URL param
- **Stats bar** — header: event counters, error count, connection indicator

---

## REST API

| Endpoint | Description |
|----------|-------------|
| `GET /api/sessions` | `{ sessions: string[] }` — all recorded session IDs |
| `GET /api/events/:sessionId` | `{ events: AgentEvent[] }` — all events for that session |
| `POST /api/agent/event` | Push event manually: `{ agent, type, sessionId, payload }` |

All endpoints localhost-only.

---

## WebSocket

Connect to `ws://localhost:3001`:

```
→ { "type": "subscribe", "sessionId": "session-1714857600-abc123" }
← { "type": "event", "event": { ... } }
← { "type": "sessionList", "sessions": [...] }
```

---

## Event types

| Type | Trigger |
|------|---------|
| `start` | Session begins (`session.created`) |
| `complete` | Tool execution finishes with result |
| `dispatch` | Agent delegates to a subagent |
| `task` | Tool execution starts |
| `error` | Tool execution fails or session errors |
| `message` | Messages and other events |

Events are written atomically (`.tmp` → `rename`) to `.agent-flow/data/{sessionId}.json`.

---

## Security

| Measure | Detail |
|----------|--------|
| 🔐 **Bind address** | `localhost` / `127.0.0.1` / `[::1]` only. External traffic rejected at TCP level. |
| 🛡️ **Origin check** | WebSocket `verifyClient` + REST `remoteAddress` ACL. Unspoofable. |
| 🔑 **Secrets redaction** | API keys, Bearer tokens, passwords, JWT, connection strings automatically scrubbed from event payloads. |
| ⚠️ **Error sanitization** | Stack traces and internal paths stripped from error events. |
| 📁 **File permissions** | Session files created with `0600` (owner read/write only). |
| 🧹 **No external deps** | Data never leaves disk. No telemetry. No cloud. |

---

## Development

```bash
# Install dependencies
npm install

# Lint
npm run lint

# Run tests (29 tests)
npm test

# Build plugin + dashboard
npm run build              # tsc + vite

# Dashboard dev server (hot reload for UI work)
npm run dev:dashboard
```

### Project structure

```
agent-flow-plugin/
├── src/                    # Source (TypeScript)
│   ├── start-dashboard.ts  # Entry point — standalone server + collector
│   ├── collector.ts        # SSE collector with reconnection
│   ├── server.ts           # Express + WebSocket dashboard server
│   ├── store/
│   │   └── index.ts        # Atomic JSON file read/write
│   ├── types.ts            # Shared type definitions
│   └── util/
│       ├── id.ts           # Crypto randomUUID-based IDs
│       ├── redact.ts       # Secrets redaction
│       └── guards.ts       # Runtime type guards
├── dashboard/              # React dashboard (TypeScript + Vite)
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── FlowGraph.tsx      # @xyflow/react agent delegation canvas
│       │   ├── Timeline.tsx       # Scrolling event log
│       │   ├── StatsBar.tsx       # Header stats + connection badge
│       │   ├── SessionSelector.tsx # Dropdown + URL param sync
│       │   └── ...
│       └── hooks/
│           └── useWebSocket.ts    # WebSocket connection + event subscription
├── dist/                   # Build output
│   ├── start-dashboard.js  # Entry point (npx @sferralove/agent-flow-plugin)
│   ├── collector.js store/ server/ util/
│   └── dashboard/          # Static dashboard (served at runtime)
├── .github/workflows/
│   ├── ci.yml              # Test on Node 18, 20, 22
│   └── publish.yml         # npm publish on git tag v*
└── .agent-flow/data/       # Generated at runtime — session event logs
```

---

## License

MIT © [@angelosferra](https://github.com/angelosferra)

---

<p align="center">
  <a href="./CHANGELOG.md">Changelog</a>
  ·
  <a href="./CONTRIBUTING.md">Contributing</a>
  ·
  <a href="https://github.com/angelosferra/agent-flow-plugin/issues">Issues</a>
</p>
