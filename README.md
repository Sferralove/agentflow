# AgentFlow

**Live agent orchestration monitor for OpenCode.** Plugin → server → dashboard pipeline that captures, traces, and visualises agent workflows in real time.

AgentFlow integrates with OpenCode as a plugin, hooks into tool execution events, and surfaces a live dashboard with a task tree, agent graph, timeline, and evidence inspection.

---

## Features

- **Plugin capture** — zero-dependency OpenCode plugin writes every tool event (task, bash, write, edit) to append-only JSONL files
- **Real-time SSE streaming** — two modes: legacy raw event streaming by session, and typed `PatchEnvelope` streaming by run via the trace engine
- **Run-first trace engine** — normalises raw events into a structured `RunSnapshot` with `TraceNode[]` (task tree), `TimelineItem[]` (chronological log), and `SessionGraph` (agent dependency graph)
- **Dashboard UI** — React 18 + ReactFlow + Tailwind: task tree (or agent graph toggle), evidence panel, timeline footer
- **Zero runtime dependencies** — Bun native HTTP, no Express, no Redis, no database. Everything is file-based (JSONL + JSON snapshots)
- **Incremental projection** — events projected in-order; patches emitted per-event; clients resume from last sequence via `after=N`

---

## Architecture

```
OpenCode Agent
  │ plugin hook events (tool.execute.before/after, event)
  ▼
Plugin (FileSink) ──▶ .agentflow/sessions/{id}.jsonl
                              │
                              ▼ poll 500ms
              ┌───────── Bun Server ─────────┐
              │  File Watcher (tail-byte)     │
              │         │                     │
              │  ┌──────┴─────────┐           │
              │  │ Legacy Graph   │ Trace     │
              │  │ (session-graph)│ Engine    │
              │  └──────┬─────────┘           │
              │         │                     │
              │  /api/stream?session=X        │
              │         │                     │
              │  ┌──────┴─────────┐           │
              │  │ eventNormalizer│           │
              │  │ traceProjector │           │
              │  │ runStore       │           │
              │  │ sseHub         │           │
              │  └──────┬─────────┘           │
              │         │                     │
              │  /api/stream?run=current      │
              │  /api/runs/current            │
              │  /api/runs/:id/snapshot       │
              └─────────┬─────────────────────┘
                        │ EventSource
              ┌─────────▼─────────┐
              │   Dashboard       │
              │  (React + Vite)   │
              │  useRunTrace hook │
              └───────────────────┘
```

### Trace Engine (v1)

The trace engine converts raw agent events into structured read models:

| Layer | Module | Responsibility |
|-------|--------|---------------|
| Normaliser | `src/trace/eventNormalizer.ts` | Converts `AgentEvent` → `NormalizedEvent` with semantic `kind` classification |
| Projector | `src/trace/traceProjector.ts` | Incrementally builds `RunSnapshot` (trace nodes, timeline items, graph) from raw events. Deduplicates by event ID |
| Store | `src/run/runStore.ts` | Persists snapshots + patches to `.agentflow/runs/{runId}/` as JSON/JSONL files |
| Hub | `src/stream/sseHub.ts` | In-memory patch history + SSE client registry. Clients replay missed patches via `after=N` |

All four layers are in-process, zero-dependency, and synchronous by default (store writes are fire-and-forget).

---

## Prerequisites

- **Bun** ≥ 1.2.0 (runtime — not Node.js compatible)
- **OpenCode** ≥ 1.x (for plugin integration)
- **npm** (for dashboard build)

---

## Quick Start

```bash
# Install
npm install @sferralove/agentflow

# Initialise (sets up .agentflow/ and copies plugin to OpenCode)
npx agentflow init

# Build TypeScript + dashboard
npm run build

# Start server
npx agentflow serve

# Open dashboard
open http://localhost:3001
```

With the plugin enabled in OpenCode, every agent session emits events that appear live on the dashboard.

---

## CLI Reference

```bash
agentflow init              # Create .agentflow/sessions, copy plugin to OpenCode plugins
agentflow serve [port]      # Start Bun server (default 3001)
agentflow stop              # Stop server by PID from .agentflow/pid
agentflow status            # Print 'running' or 'stopped'
```

---

## API Reference

### Run-First API (v1)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check: `{ status, clients, sessions }` |
| `GET /api/runs/current` | Current `RunSnapshot` (in-memory projector state) |
| `GET /api/runs` | List `{ runs: Run[] }` |
| `GET /api/runs/:runId/snapshot` | Persisted `RunSnapshot` from store |
| `GET /api/stream?run=current&after=N` | SSE stream of typed `PatchEnvelope` events |

### Legacy API (pre-v1)

| Endpoint | Description |
|----------|-------------|
| `GET /api/stream?session=X` | SSE stream of raw JSONL events for a session |
| `GET /api/events?session=X&since=TS&tree=true` | JSON events for a session (or all sessions merged with `tree=true`) |
| `GET /api/agents/X?tree=true` | Agent graph (nodes + edges) |
| `GET /api/sessions` | Available sessions list |

### SSE Patch Events

When using `?run=current`, each SSE event is a named `PatchEnvelope<T>`:

```
event: trace.node.upserted
id: 3
data: {"id":"patch_3","runId":"run_session_1","sequence":3,"type":"trace.node.upserted","payload":{...}}
```

| SSE Event Name | Payload Type | Fires When |
|----------------|-------------|-----------|
| `raw.event` | `AgentEvent` | Every raw event ingested |
| `trace.node.upserted` | `TraceNode` | Trace node created or status changed |
| `trace.node.completed` | `TraceNode` | Trace node reaches completed/failed |
| `timeline.item.upserted` | `TimelineItem` | Timeline entry added |
| `graph.node.upserted` | `AgentNode` | Graph node created or updated |
| `graph.edge.upserted` | `AgentEdge` | Graph edge created |
| `run.updated` | `Run` | Run status, timestamps changed |

---

## Dashboard

The dashboard has three panels:

1. **Work Trace** (main) — hierarchical task tree of trace nodes; toggle to AgentGraph (ReactFlow). Select any node to inspect evidence.
2. **Evidence Panel** (right) — raw event inputs, outputs, and errors backing the selected trace node.
3. **Timeline** (bottom) — chronologically sorted timeline items; click to jump to the corresponding trace node.

### Development Mode

```bash
# Start Vite HMR dev server (port 3000)
npm -C dashboard run dev

# In another terminal, start the Bun API server
npx agentflow serve 3001
```

---

## Development

```bash
# TypeScript + dashboard build
npm run build

# Run tests (requires Bun)
npm test

# TypeScript check only
npx tsc --noEmit
```

### Key gotchas

- All internal imports use `.js` extensions (ESM + bundler moduleResolution)
- Server uses `readdirSync` + `readFileSync` polling (not `fs.watch` — unreliable on macOS)
- All API path params are sanitised via `sanitizeSessionId()` / `sanitizeFilePath()`
- Edge deduplication: `!graph.edges.some(e => e.source === X && e.target === Y)` before push
- Trace projector deduplicates raw events by ID in-memory

### Project structure

```
src/
  cli.ts, plugin.ts, server.ts, types.ts, index.ts, toolTiming.ts
  trace/             # Trace engine core
    traceTypes.ts, eventNormalizer.ts, traceProjector.ts, graphProjector.ts
  run/               # Persistence
    runStore.ts
  stream/            # SSE delivery
    sseHub.ts
dashboard/           # React app
  src/
    App.tsx, main.tsx, types.ts
    hooks/useRunTrace.ts, useSSE.ts
    components/AgentGraph.tsx, TraceTree.tsx, TraceEvidencePanel.tsx, TraceTimeline.tsx, ...
    utils/criticalPath.ts, timeline.ts
test/                # 10 test files (bun:test)
docs/                # Design specs and plans
```

---

## License

MIT
