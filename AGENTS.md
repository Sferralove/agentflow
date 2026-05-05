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
Server (Bun.serve) → SSE (/api/stream) + REST (/api/events, /api/agents/*)
                       ↓ EventSource
Dashboard (React/Vite) → flow graph + timeline
```

- **Plugin**: zero runtime deps. Hooks: `tool.execute.before`, `tool.execute.after`, `event`. Writes append-only JSONL via `FileSink` with flush debounce (250ms) and eviction (max 50 writers).
- **Server**: zero runtime deps. No Express — Bun native HTTP. File watcher is `setInterval` + `readdirSync` (not `fs.watch` — unreliable on macOS). Reads only new bytes via byte-offset tracking.
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
All 4 API endpoints that accept params MUST call `sanitizeSessionId()` or `sanitizeFilePath()`. SessionId: `[a-zA-Z0-9_-]` max 128. FilePath: strip `..` and `//`.

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

## CLI

```bash
agentflow init        # Create .agentflow/sessions, copy plugin to .opencode/plugins/
agentflow serve [port]  # Start Bun server (default :3001)
agentflow stop        # SIGTERM by PID from .agentflow/pid
agentflow status      # Print 'running' or 'stopped'
```

## Directory Layout

```
src/           # Library code (cli.ts, plugin.ts, server.ts, types.ts, index.ts)
dashboard/     # React app — separate package.json, tsconfig, vite config
dist/          # Build output (gitignored) — tsc → dist/, vite → dashboard/dist/
test/          # Bun tests (smoke.test.ts)
.agentflow/    # Runtime data — sessions/ JSONL + pid file (gitignored)
docs/          # Design specs and implementation plans
```

## API Endpoints

| Endpoint | Method | Auth |
|----------|--------|------|
| `/health` | GET | None |
| `/api/stream?session=X` | GET | SSE |
| `/api/events?session=X&since=TS` | GET | None |
| `/api/agents/X` | GET | None |
