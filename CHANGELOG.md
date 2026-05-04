# Changelog

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
