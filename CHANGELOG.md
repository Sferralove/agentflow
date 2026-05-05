# Changelog

## [2.0.0] — 2026-05-05

### Changed
- **SSE collector as primary event source** — zero agent cooperation needed. Reads OpenCode event stream at `:4101/global/event`.
- **Removed plugin hooks** — no more `@opencode-ai/plugin` dependency, zero crash risk inside OpenCode runtime.
- **Single store writer** — all events go through `PluginStore`, no more path mismatch (`sessions/` vs `data/`).
- **Automatic reconnection** — collector retries with exponential backoff on connection loss.
- **Unified event model** — single `AgentEvent` type, removed duplicate `AgentFlowEvent`.

### Removed
- `src/hooks/` — old tool hook system (crashed OpenCode)
- `src/tools/` — `agentflow_events/sessions/stats` (depended on dead plugin)
- `src/plugin-container.ts` — unused state container
- `@opencode-ai/plugin` peer dependency

### Fixed
- Path divergence: collector wrote to `data/sessions/`, store read from `data/`
- File watcher missing recursive events from subdirectories
- Potential race condition with dual writers on same JSON file

## [1.0.0] — 2026-05-04

### Added
- **Real-time dashboard** — React + xyflow flow graph, live event timeline, stats bar, session selector
- **WebSocket broadcast** — subscribe per-session, receive events as they happen
- **REST API** — `GET /api/sessions`, `GET /api/events/:sessionId` (localhost only)
- **Secrets redaction** — API keys, Bearer tokens, passwords, JWT, connection strings automatically scrubbed
- **Error sanitization** — stack traces and internal paths stripped from error payloads
- **File permissions** — session files created with `0600`
- **CI/CD pipeline** — GitHub Actions: test on Node 18/20/22, npm publish on tag `v*`
- Professional README with full documentation

### Security
- Dashboard server binds `localhost`/`127.0.0.1`/`[::1]` only
- WebSocket `verifyClient` + REST `remoteAddress` ACL — unspoofable
- Data never leaves disk — no telemetry, no cloud

## [0.2.0] — 2026-05-04

### Changed
- **Breaking:** Compiled output now in `dist/` (was project root). Update `main`/`types`/`files` in package.json if consuming directly.
- **Breaking:** `AgentFlowPlugin` now accepts `{ directory, logger? }` (logger param added).

### Fixed
- Race condition in `inFlight` tracking — switched from single-entry Map to FIFO stack per tool type.
- Module-level mutable state replaced with `PluginContainer` instance — safe for concurrent use.
- Duplicated `generateId()` extracted to shared `src/util/id.ts`.

### Added
- `PluginContainer` class for instance-level state management.
- Runtime input validation via type guards (`isToolInput`, `isMessageInput`, etc.) — replaces bare `as` casts.
- Injectable logger parameter (`logger?: Logger`) — defaults to `console`.
- 39-unit test suite across all modules (node:test, zero test deps).
- ESLint config with TypeScript rules.
- CI/CD — GitHub Actions (test on Node 18/20/22, publish on tag).
- Package metadata: `repository`, `bugs`, `homepage`, `engines`, `publishConfig`.

### Removed
- Old compiled output from project root (`index.js`, `types.js`, `hooks/`, `store/`, `tools/`).

## [0.1.0] — Initial release

- Plugin factory with session/tool/message hooks.
- Atomic JSON event storage to `.agent-flow/data/`.
- Custom tools (`agentflow_events`, `agentflow_sessions`, `agentflow_stats`).
- Tool-to-agent mapping for flow visualization.
- Subagent dispatch detection.
- Message dedup.
