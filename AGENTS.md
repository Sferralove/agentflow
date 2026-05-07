# AgentFlow v2 — Agent Instructions

## Build & Test

```bash
npm run build          # tsc + vite dashboard build (order matters)
npm run test           # bun test — requires Bun. SKIP if bun not installed.
npm -C dashboard run dev   # Vite HMR dev server on :3000
```

TypeScript check only (no Bun needed): `npx tsc --noEmit`

## Runtime

**Bun only.** `"engines": { "bun": ">=1.2.0" }`. Server uses `Bun.serve`, `Bun.file`, `Bun.write`. Plugin uses `Bun.file().writer()` (FileSink). Tests require `bun:test`. Do not try Node.

## Architecture

```
Plugin (hooks) → JSONL files (.agentflow/sessions/{id}.jsonl)
                       ↓ poll 500ms (readdirSync + tail-by-offset)
Server (Bun.serve) → Legacy: SSE (/api/stream?session=) + REST (/api/events, /api/agents/*)
                     Trace Engine:
                       traceProjector → normalized events → traceNodes → timeline → graph
                       runStore       → persist snapshots + patches to .agentflow/runs/{id}/
                       sseHub         → typed PatchEnvelope SSE (/api/stream?run=current)
                       ↓ EventSource
Dashboard (React/Vite) → useRunTrace hook → Work Trace tree, Evidence Panel, Timeline, AgentGraph
```

- **Plugin**: zero runtime deps. Hooks: `tool.execute.before`, `tool.execute.after`, `event`. Writes append-only JSONL via `FileSink` with flush debounce (250ms) and eviction (max 50 writers).
- **Server**: zero runtime deps. No Express — Bun native HTTP. File watcher is `setInterval` + `readdirSync` (not `fs.watch` — unreliable on macOS). Reads only new bytes via byte-offset tracking.
- **Trace Engine** (v1): Three-layer pipeline — `eventNormalizer` converts raw AgentEvents to `NormalizedEvent` records; `traceProjector` incrementally projects normalized events into a `RunSnapshot` with `TraceNode[]`, `TimelineItem[]`, and `SessionGraph`; patches are persisted via `runStore` and streamed via `sseHub`. Runs are derived read models — raw events remain source of truth.
- **Dashboard**: React 18 + ReactFlow + Tailwind. Built to `dashboard/dist/`, served statically by Bun server. Dev on :3000, production on :3001.

## Critical Gotchas

### Import extensions
ESM, `moduleResolution: "bundler"`. All internal imports MUST use `.js` suffix:
```ts
import { startServer } from './server.js'  // correct
import { startServer } from './server'      // WRONG — breaks at runtime
```

### File watcher
Uses `readdirSync` + `readFileSync` (not `Bun.file(dir).values()`). Byte-offset map (`readOffsets`) tracks last read position per file. Read full file, slice new content — safe because JSONL is append-only.

### Path sanitization (SECURITY)
All API endpoints that accept params MUST call `sanitizeSessionId()` or `sanitizeFilePath()`. SessionId: `[a-zA-Z0-9_-]` max 128. FilePath: strip `..` and `//`.

### Edge deduplication
Before pushing to `graph.edges`: check `!graph.edges.some(e => e.source === X && e.target === Y)`.

### Plugin hook constraints
- Only 4 tools tracked: `task`, `write`, `edit`, `bash` (`TOOLS_TRACKED` set)
- `event` hook: only `session.*` events processed
- Session ID extraction: heuristic — tries `sessionId`, `sessionID`, `session.id`, `properties.sessionId`, `properties.sessionID`
- Duration: computed locally from `Date.now()` delta in before/after hooks (output.duration not guaranteed)

### Dashboard build
Dashboard is a separate package (`dashboard/package.json`) with its own `tsc` check. Root `npm run build` runs: `tsc` (root src) → `npm -C dashboard run build` (`tsc && vite build`).

### No CI
No `.github/workflows`. No pre-commit hooks. `npm run build` is the only verification before pushing.

### Trace deduplication
`traceProjector` deduplicates by raw event ID in-memory through `seenRawIds` Set. `runStore` appends patches without dedup — consumers must handle idempotent apply.

### SSE patch format
Patches are typed `PatchEnvelope<T>` objects sent as named SSE events. The event type matches `PatchType` (e.g., `trace.node.upserted`, `run.updated`). Dashboard's `useRunTrace` hook applies patches immutably via `applyPatch()`.

## CLI

```bash
agentflow init        # Create .agentflow/sessions, copy plugin to .opencode/plugins/
agentflow serve [port]  # Start Bun server (default :3001)
agentflow stop        # SIGTERM by PID from .agentflow/pid
agentflow status      # Print 'running' or 'stopped'
```

## Directory Layout

```
src/
  cli.ts              # CLI entry: init, serve, stop, status
  plugin.ts           # OpenCode plugin — JSONL writer via FileSink
  server.ts           # Bun HTTP server — file watcher, SSE, REST API, trace engine integration
  types.ts            # Shared AgentEvent, AgentNode, AgentEdge, SessionGraph types
  index.ts            # Public package exports
  toolTiming.ts       # Duration tracking helpers
  trace/
    traceTypes.ts     # Run, NormalizedEvent, TraceNode, TimelineItem, PatchEnvelope, RunSnapshot
    eventNormalizer.ts# Converts AgentEvent → NormalizedEvent with kind inference
    traceProjector.ts # Incrementally projects raw events into RunSnapshot + patches
    graphProjector.ts # Legacy graph builder — applies events to SessionGraph
  run/
    runStore.ts       # Filesystem persistence for active run, snapshots, patches
  stream/
    sseHub.ts         # SSE client registry, patch history, replay for typed patch streaming
dashboard/            # React app — separate package.json, tsconfig, vite config
  src/
    App.tsx, main.tsx
    types.ts          # Mirrored trace types + legacy types
    hooks/
      useSSE.ts       # Legacy session-based SSE hook
      useRunTrace.ts  # Trace engine hook — snapshot fetch + patch SSE via ?run=current
    components/
      AgentGraph.tsx, AgentNode.tsx, DetailPanel.tsx, EventRow.tsx, Header.tsx
      TraceTree.tsx, TraceEvidencePanel.tsx, TraceTimeline.tsx  # New v1 components
    utils/
      criticalPath.ts # Compute critical path from graph + events
      timeline.ts     # Timeline filtering utilities
dist/                 # Build output (gitignored) — tsc → dist/, vite → dashboard/dist/
test/                 # Bun tests — 10 files covering all modules
.agentflow/           # Runtime data — sessions/ JSONL, runs/ snapshots, pid file (gitignored)
docs/                 # Design specs and implementation plans
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check (clients, sessions count) |
| `/api/runs/current` | GET | Current `RunSnapshot` from in-memory projector |
| `/api/runs` | GET | List of active runs |
| `/api/runs/:id/snapshot` | GET | Persisted `RunSnapshot` from store (by runId) |
| `/api/stream?run=current[&after=N]` | GET | SSE — typed `PatchEnvelope` events from trace engine |
| `/api/stream?session=X` | GET | SSE — legacy raw JSONL events |
| `/api/events?session=X[&since=TS][&tree=true]` | GET | JSON events for session |
| `/api/agents/X[?tree=true]` | GET | Agent graph (nodes + edges) |
| `/api/sessions` | GET | Available sessions list |

### SSE Patch Events (run=current)

When using `?run=current`, the stream emits named SSE events:

| Event Type | Payload | Description |
|------------|---------|-------------|
| `raw.event` | `AgentEvent` | Raw event recorded (firehose) |
| `trace.node.upserted` | `TraceNode` | Trace node created or updated |
| `trace.node.completed` | `TraceNode` | Trace node marked completed |
| `timeline.item.upserted` | `TimelineItem` | Timeline entry added or updated |
| `graph.node.upserted` | `AgentNode` | Graph node created or updated |
| `graph.edge.upserted` | `AgentEdge` | Graph edge created or updated |
| `run.updated` | `Run` | Run metadata updated (status, timestamps) |

Patches are ordered by `sequence` and clients can resume with `after=N` query parameter.
