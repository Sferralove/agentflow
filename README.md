# Agent Flow Plugin

<p align="center">
  <img src="https://img.shields.io/npm/v/agent-flow-plugin?color=emerald" alt="npm version" />
  <img src="https://img.shields.io/github/actions/workflow/status/angelosferra/agent-flow-plugin/ci.yml?branch=main" alt="CI" />
  <img src="https://img.shields.io/node/v/agent-flow-plugin" alt="node" />
  <img src="https://img.shields.io/npm/l/agent-flow-plugin" alt="license" />
</p>

> **Zero-touch agent monitoring & real-time flow visualization for OpenCode.**
>
> Agents don't need to know they're being watched. The plugin silently hooks into every event,
> writes them to disk, and serves a live React dashboard — no cooperation required.

---

## What it does

Every time an OpenCode agent runs a tool, delegates a subagent, completes a task, posts a message,
or hits an error — Agent Flow captures it. All activity is saved to `.agent-flow/data/{sessionId}.json`
and streamed in real-time via WebSocket to a React dashboard.

| Capability | Detail |
|---|---|
| 📡 **Passive monitoring** | No agent modification needed. Hooks into OpenCode runtime events. |
| 🧭 **Flow graph** | Interactive canvas showing agents as nodes, delegations as edges, powered by [xyflow](https://xyflow.com). |
| ⏱️ **Live timeline** | Scrollable event feed, color-coded by type, updates in real-time. |
| 📊 **Stats bar** | Event counts by type, error rate, connection status — at a glance. |
| 🔍 **Custom tools** | Agents can query their own activity via `agentflow_events`, `agentflow_sessions`, `agentflow_stats`. |
| 🔒 **Localhost only** | Dashboard server rejects all external connections. Your data never leaves the machine. |
| 💾 **Atomic writes** | Events written to `.tmp` then `rename`d — safe against crashes and partial writes. |

---

## Screenshot

```
┌──────────────────────────────────────────────────────────────────┐
│  AGENT FLOW  ▾ session-1714857600-abc123  │ events: 42  ⬤ connected │
├──────────────────────────┬───────────────────────────────────────┤
│  Timeline                │  Flow Graph                           │
│                          │                                       │
│  ▸ 22:10:04  start       │     [builder] ──dispatch──▶ [backend] │
│     agent: builder       │        │                              │
│  ▸ 22:10:05  task        │        │ dispatch                     │
│     agent: delegator     │        ▼                              │
│     tool: task           │     [tester]                          │
│  ▸ 22:10:06  dispatch    │                                       │
│     builder → backend    │                                       │
│  ▸ 22:10:08  complete    │                                       │
│     agent: backend       │                                       │
│  ▸ 22:10:09  message     │                                       │
│     agent: assistant     │                                       │
│  ⋮                       │                                       │
│                          │                                       │
└──────────────────────────┴───────────────────────────────────────┘
```

---

## Installation

### Option A: Published npm package

```json
// opencode.json
{ "plugins": ["agent-flow-plugin"] }
```

OpenCode will install the plugin automatically on next start.

### Option B: Local plugin (for development or custom builds)

```bash
mkdir -p .opencode/plugins/agent-flow
cp package.json .opencode/plugins/agent-flow/
cp -r dist/ .opencode/plugins/agent-flow/
cd .opencode/plugins/agent-flow && npm install --production
```

> [!IMPORTANT]
> `npm install --production` is required — the plugin depends on `express` and `ws` at runtime.

---

## Usage

Once the plugin is loaded, everything is automatic. No configuration needed.

### Dashboard

Open **`http://localhost:3001`** in your browser while OpenCode is running.

- **Flow Graph** — left panel: see the agent delegation tree in real-time
- **Timeline** — right panel: scroll through all events, newest first
- **Session selector** — top bar: switch between sessions via dropdown or `?session=` URL param
- **Stats bar** — header: event counters, error count, WebSocket connection indicator

### Custom tools for agents

Agents can introspect their own activity using these built-in tools:

| Tool | Signature | Returns |
|---|---|---|
| `agentflow_events` | `(sessionId?, limit?)` | Events for a session (or latest across all), newest first |
| `agentflow_sessions` | `()` | Array of all session IDs |
| `agentflow_stats` | `(sessionId?)` | Aggregated stats: counts by type, by agent, total, errors, time range |

Payloads are truncated to prevent token bloat: `result` strings at 200 chars, message content at 300 chars.

---

## Configuration

Create `.agent-flow/config.json` in your project root (optional — defaults shown below):

```json
{
  "version": "0.2.0",
  "dataDir": ".agent-flow/data",
  "dashboard": {
    "port": 3001,
    "host": "localhost"
  }
}
```

| Field | Default | Description |
|---|---|---|
| `version` | `"0.2.0"` | Schema version (for future migrations) |
| `dataDir` | `.agent-flow/data` | Where session JSON files are stored |
| `dashboard.port` | `3001` | HTTP + WebSocket server port |
| `dashboard.host` | `localhost` | Bind address |

---

## Plugin API

Plugins built on the Agent Flow plugin factory can be composed with other OpenCode plugins.

```ts
import { AgentFlowPlugin } from 'agent-flow-plugin';

const plugin = await AgentFlowPlugin({
  directory: '/path/to/project',
  logger: customLogger, // optional — defaults to console
});

// Returns:
// {
//   'session.created': Hook,
//   'session.idle': Hook,
//   'session.error': Hook,
//   'tool.execute.before': Hook,
//   'tool.execute.after': Hook,
//   'message.updated': Hook,
//   tool: {
//     agentflow_events,
//     agentflow_sessions,
//     agentflow_stats
//   }
// }
```

## REST API

The dashboard server exposes two read-only endpoints (localhost only):

| Endpoint | Description |
|---|---|
| `GET /api/sessions` | `{ sessions: string[] }` — all recorded session IDs |
| `GET /api/events/:sessionId` | `{ events: AgentEvent[] }` — all events for that session |

## WebSocket

Connect to `ws://localhost:3001` to receive real-time updates:

```
→ { "type": "subscribe", "sessionId": "session-1714857600-abc123" }
← { "type": "event", "event": { ... } }
← { "type": "sessionList", "sessions": [...] }
```

---

## Event types

Every captured action is logged as an `AgentEvent`:

| Type | Trigger |
|---|---|
| `start` | Session begins (`session.created`) |
| `complete` | Tool execution finishes with result |
| `dispatch` | Agent delegates to a subagent |
| `task` | Tool execution starts |
| `error` | Tool execution fails or session errors |
| `message` | Assistant message emitted |

Events are written **atomically** (`.tmp` → `rename`) to `.agent-flow/data/{sessionId}.json`.

---

## Agent identity mapping

Tools are mapped to named agent roles for the flow graph. If `args.agent` is present in the tool input, it overrides the automatic mapping.

| Tool | Agent node label |
|---|---|
| `task` | `delegator` |
| `bash` | `shell` |
| `read` | `reader` |
| `write` | `writer` |
| `edit` | `editor` |
| `grep` | `searcher` |
| `glob` | `finder` |
| `webfetch` | `fetcher` |
| `skill` | `skill-loader` |
| `todowrite` | `delegator` |
| *any other* | `opencode` |

---

## Security

| Measure | Detail |
|---|---|
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

# Run tests (60 tests, zero external test dependencies)
npm test

# Build plugin + dashboard
npm run build           # tsc + vite

# Dashboard dev server (hot reload for UI work)
npm run dev:dashboard
```

### Project structure

```
agent-flow-plugin/
├── src/                  # Plugin source (TypeScript)
│   ├── index.ts          # Plugin factory + entry point
│   ├── types.ts          # Shared type definitions
│   ├── server.ts         # Express + WebSocket dashboard server
│   ├── plugin-container.ts  # Instance-level state (sessionId, inFlight, dedup)
│   ├── hooks/
│   │   ├── session.ts    # session.created / idle / error
│   │   ├── tool.ts       # tool.execute.before / after
│   │   └── message.ts    # message.updated
│   ├── store/
│   │   └── index.ts      # Atomic JSON file read/write
│   ├── tools/
│   │   └── index.ts      # agentflow_events / sessions / stats
│   └── util/
│       ├── id.ts         # Crypto randomUUID-based IDs
│       ├── redact.ts     # Secrets redaction
│       └── ...
├── dashboard/            # React dashboard (TypeScript + Vite)
│   └── src/
│       ├── App.tsx       # Main layout: header + timeline + flow graph
│       ├── components/
│       │   ├── FlowGraph.tsx    # @xyflow/react agent delegation canvas
│       │   ├── Timeline.tsx     # Scrolling event log
│       │   ├── StatsBar.tsx     # Header stats + connection badge
│       │   ├── SessionSelector.tsx  # Dropdown + URL param sync
│       │   ├── EventRow.tsx     # Color-coded event row
│       │   └── AgentNode.tsx    # Custom xyflow node
│       ├── hooks/
│       │   └── useWebSocket.ts  # WebSocket connection + event subscription
│       └── types.ts
├── dist/                 # Build output
│   ├── index.js          # Plugin entry
│   ├── hooks/ server/ store/ tools/ util/
│   └── dashboard/        # Static dashboard (served at runtime)
├── .github/workflows/
│   ├── ci.yml            # Test on Node 18, 20, 22
│   └── publish.yml       # npm publish on git tag v*
└── .agent-flow/data/     # Generated at runtime — session event logs
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
