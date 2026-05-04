# Agent Flow Plugin — Production Hardening Design

> **Status:** Design spec
> **Goal:** Elevate agent-flow-plugin from 7/10 intermediate to production-ready professional npm package

## Summary

Refactor the agent-flow-plugin OpenCode plugin to fix a race condition, eliminate module-level mutable state, add tests and CI, normalize package structure, and add input validation. The plugin's architecture (clean hook/store/tools separation, atomic writes, event type system) is already professional-grade. Fixes target the amateur-ish gaps found during code review.

## Key Architecture Changes

### 1. Class-based Plugin Container (replaces module-level state)

Current: `let currentSessionId` at module scope in `session.ts`, imported via `getCurrentSessionId()` by `tool.ts` and `message.ts`. Fragile — not testable, not instance-safe.

New: `PluginContainer` class holds all mutable state as instance fields:

```typescript
class PluginContainer {
  sessionId: string | null = null;
  sessionStartedAt: number = 0;
  inFlight = new Map<string, Array<{ agent: string; startedAt: number }>>();
  loggedMessages = new Set<string>();
}
```

Each factory (`createSessionHook`, `createToolHooks`, `createMessageHooks`) receives the container instance. No module-level `getCurrentSessionId()` cross-import needed — the container is passed at construction and captured via closure.

### 2. Fixed inFlight tracking (race condition fix)

Current: `inFlight.set(inp.tool, ...)` — keyed by tool name. Concurrent calls to same tool (e.g., two `bash` calls) overwrite each other.

New: Per-tool stack:
- Before: `push` execution data onto `inFlight.get(inp.tool)[]`
- After: `shift` from the stack (FIFO)
- Correct for sequential execution and concurrent-with-FIFO-completion — covers all realistic OpenCode execution patterns

### 3. Shared utilities

Extract `generateId()` from 3 duplicated locations into `src/util/id.ts`.

### 4. Input validation

Replace `input as ToolInput` assertions with type guard functions (`isToolInput`, `isMessageInput`) that check required fields at runtime.

### 5. Output directory: `dist/`

- `tsconfig.json` `outDir` changes from `"."` to `"dist"`
- `package.json` `main` → `"dist/index.js"`, `types` → `"dist/index.d.ts"`
- `files` array scoped to `dist/` contents

### 6. Logger injection

`AgentFlowPlugin({ directory, logger })` — `logger` defaults to `console`. All internal logging uses `logger.info(...)`, `logger.warn(...)`, `logger.error(...)`.

### 7. Package metadata

Add `repository`, `bugs`, `homepage`, `engines` (`>=18`), `publishConfig: { access: "public" }`.

### 8. Tests (node:test)

Test file per module:
- `src/store/index.test.ts` — read/write, atomic write, edge cases
- `src/hooks/session.test.ts` — session lifecycle events
- `src/hooks/tool.test.ts` — toolToAgent mapping, event construction, dispatch detection
- `src/hooks/message.test.ts` — message dedup
- `src/tools/index.test.ts` — query tools
- `src/util/id.test.ts` — id generation

### 9. CI/CD (GitHub Actions)

- `.github/workflows/ci.yml` — test on Node 18, 20, 22
- `.github/workflows/publish.yml` — npm publish on tag push

### 10. ESLint config

- `eslint.config.js` with TypeScript rules
- `lint` script in package.json

## File Changes Summary

| Action | Path |
|--------|------|
| **Create** | `src/util/id.ts` |
| **Create** | `src/util/id.test.ts` |
| **Create** | `src/plugin-container.ts` |
| **Create** | `src/store/index.test.ts` |
| **Create** | `src/hooks/session.test.ts` |
| **Create** | `src/hooks/tool.test.ts` |
| **Create** | `src/hooks/message.test.ts` |
| **Create** | `src/tools/index.test.ts` |
| **Create** | `.github/workflows/ci.yml` |
| **Create** | `.github/workflows/publish.yml` |
| **Create** | `eslint.config.js` |
| **Modify** | `src/index.ts` — accept logger, pass container |
| **Modify** | `src/hooks/session.ts` — accept container, remove module state |
| **Modify** | `src/hooks/tool.ts` — accept container, use FIFO stack |
| **Modify** | `src/hooks/message.ts` — accept container |
| **Modify** | `src/store/index.ts` — no changes needed (already clean) |
| **Modify** | `src/tools/index.ts` — no changes needed |
| **Modify** | `src/types.ts` — add `Logger` type |
| **Modify** | `tsconfig.json` — `outDir: "dist"` |
| **Modify** | `package.json` — metadata, paths, scripts |
| **Remove** | `index.js`, `index.d.ts`, `types.js`, `types.d.ts`, `hooks/`, `store/`, `tools/` (old compiled output in root) |

## Error Handling Strategy

- Type guard failures → log warning, return early (don't crash plugin)
- Store I/O errors → catch, log, absorb (plugin failure shouldn't crash OpenCode)
- Logger failures → silently ignored (logger is optional infrastructure)

## Testing Strategy

- Pure unit tests for `toolToAgent()`, `generateId()`, event construction
- Integration tests with in-memory temp dir for store operations
- Mock logger for verifying log output
- No network dependency in tests
- No OpenCode runtime dependency — mock the hook interface

## What's NOT Changing

- Event type system (`start | complete | dispatch | task | error | message`)
- Atomic write pattern (tmp + rename)
- Plugin API shape (`AgentFlowPlugin({ directory }) => { hooks, tool }`)
- Tool-to-agent mapping table
- Custom tools (`agentflow_events`, `agentflow_sessions`, `agentflow_stats`)
- Content truncation limits (200/300 chars)
- No external database, no server
