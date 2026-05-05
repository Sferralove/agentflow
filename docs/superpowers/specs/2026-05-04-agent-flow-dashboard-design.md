# Agent Flow Dashboard — Design Spec

> **Status:** Approved design
> **Goal:** Real-time React dashboard embedded in agent-flow-plugin

## Architecture

```
plugin start → HTTP server (express) + WebSocket server (ws)
             → serve dashboard/dist/ (static React build)
             → ogni evento hook → broadcast WS ai client
```

Single HTTP server on configurable port (default 3001). Express serves React static build. `ws` WebSocket server attaches to same HTTP server. Plugin hooks push events to all connected WS clients.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Frontend | React + Vite + TypeScript | Modern bundling, HMR, zero-config TS |
| Flow graph | `@xyflow/react` (reactflow v12) | Interactive canvas, edge routing, minimap |
| Timeline | Custom React component | Tailored to our event types, lightweight |
| WebSocket | `ws` | Lean binary protocol, no abstractions |
| Static serve | `express` | Standard, ~50 lines |
| Styling | Tailwind CSS v4 | Utility-first, dark theme built-in |
| Charts | none (custom CSS) | Flow graph and timeline are the visualizations |

## Dashboard Layout

```
┌─────────────────────────────────────────────────┐
│ StatsBar   [session ▾]  [● connected]           │
├─────────────┬───────────────────────────────────┤
│             │                                   │
│  Timeline   │        Flow Graph                 │
│  (300px)    │        (flex-1)                   │
│             │                                   │
│  Scrollable │     ┌───┐     ┌───┐              │
│  event list │     │ B │────▶│ S │              │
│  reverse    │     └───┘     └───┘              │
│  chrono     │       │                     │
│             │       ▼                     │
│             │     ┌───┐              │
│             │     │ W │              │
│             │     └───┘              │
│             │                                   │
└─────────────┴───────────────────────────────────┘
```

- **StatsBar**: total events, errors, session duration, connection status, session dropdown
- **Timeline** (left, 300px): scrollable event list, newest first, color-coded by event type
- **FlowGraph** (right, flex): interactive reactflow canvas, nodes = agents, edges = tool calls

## Components

### App
Root. Manages sessionId state, WS connection, event buffer. Route via `?session=` query param.

### SessionSelector
Dropdown of available sessions (from `agentflow_sessions` API). On change, updates WS subscription and reloads events.

### FlowGraph
Reactflow canvas with custom nodes and edges:
- **AgentNode**: agent name, event count badge, agent type icon
- **ToolEdge**: animated edge with tool name label, duration, status color
- Auto-layout via dagre
- Minimap, zoom controls

### Timeline
- Scrollable container, newest events at top
- Infinite scroll: loads older events on scroll up
- Color-coded rows by event type (start=green, complete=blue, error=red, dispatch=purple, message=gray)
- Each row: timestamp (HH:mm:ss), agent icon, agent name, action description

### EventRow
Single timeline row. Compact: icon + time + agent + type + description. Expandable for full payload.

### StatsBar
Top bar: total events count, error count, session start time, elapsed time, connection indicator (green dot). Session dropdown on right.

## WebSocket Protocol

```
Server → Client:
  { type: "event", event: AgentEvent }
  { type: "sessionList", sessions: string[] }

Client → Server:
  { type: "subscribe", sessionId: string }
  { type: "requestSessions" }
```

On connect, server sends current session list. Client subscribes to a session. Server broadcasts new events to clients subscribed to that session.

## Data Flow

1. Plugin hook fires (`session.created`, `tool.execute.before`, etc.)
2. Event written to `.agent-flow/data/{sessionId}.json` (existing store)
3. Event broadcast via WebSocket to clients subscribed to that sessionId
4. All clients receive event → append to timeline + update flow graph

## File Structure

```
agent-flow-plugin/
├── src/                          # plugin TypeScript (existing)
│   ├── index.ts                  # modified: start server on load
│   ├── server.ts                 # NEW: express + ws server + broadcast
│   ├── hooks/                    # modified: broadcast events
│   ├── store/                    # unchanged
│   ├── tools/                    # unchanged
│   └── types.ts                  # modified: add ServerConfig
├── dashboard/                    # NEW: React + Vite
│   ├── src/
│   │   ├── main.tsx              # entry point
│   │   ├── App.tsx               # root component
│   │   ├── components/
│   │   │   ├── FlowGraph.tsx
│   │   │   ├── AgentNode.tsx     # custom reactflow node
│   │   │   ├── ToolEdge.tsx      # custom reactflow edge
│   │   │   ├── Timeline.tsx
│   │   │   ├── EventRow.tsx
│   │   │   ├── SessionSelector.tsx
│   │   │   └── StatsBar.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   └── useEvents.ts
│   │   └── types.ts
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── .agent-flow/
│   └── config.json               # modified: add port config
└── package.json                  # modified: add dashboard scripts
```

## Build & Development

```
# Plugin build (unchanged)
npm run build          # tsc -p tsconfig.json

# Dashboard build
cd dashboard && npm run build   # vite build → ../dist/dashboard/

# Development
cd dashboard && npm run dev     # Vite dev server on port 5173
                                 # Proxies WS to plugin on port 3001

# Plugin dev + Dashboard dev (two terminals)
Terminal 1: npm run dev          # plugin with server on :3001
Terminal 2: cd dashboard && npm run dev  # Vite HMR on :5173
```

Plugin serves dashboard from `dist/dashboard/` when built. In dev, Vite dev server proxies WS to plugin.

## Configuration

`.agent-flow/config.json`:
```json
{
  "version": "0.2.0",
  "dataDir": ".agent-flow/data",
  "dashboard": {
    "port": 3001,
    "host": "localhost",
    "autoOpen": true
  },
  "createdAt": "..."
}
```

## Error Handling

- Dashboard build missing → server starts without dashboard route, logs warning
- Port in use → log error, plugin still works (monitoring unaffected)
- WS client disconnect → clean removal from subscription map
- WS message parse error → log, ignore, don't crash

## Out of Scope

- Multi-session aggregation view (single session per dashboard instance)
- Authentication / access control
- Event persistence beyond JSON files (no database)
- Historical replay (real-time only)
- Export / share functionality

## Testing Strategy

- Server unit tests: WS broadcast, subscription management, static file serving
- React component tests: render with mock events, interaction tests
- Integration: plugin + dashboard end-to-end with mock hooks
