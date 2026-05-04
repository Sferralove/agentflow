# Agent Flow Plugin — OpenCode agent monitor

Automatic agent/subagent activity monitor. Hooks into OpenCode events, writes JSON to `.agent-flow/data/`. Zero agent cooperation needed.

## Quick install

```bash
mkdir -p .opencode/plugins/agent-flow
cp src/index.ts .opencode/plugins/agent-flow/
cp -r src/hooks src/store src/tools src/types.ts .opencode/plugins/agent-flow/
cp package.json .opencode/plugins/agent-flow/
```

## Build

```bash
npm install
npm run build    # tsc -p tsconfig.json
```

**Build output:** Compiled `.js`/`.d.ts` go to `dist/` (e.g. `src/hooks/session.ts` → `dist/hooks/session.js`). The `package.json` `files` array ships only `dist/`.

## Plugin API shape

Plugin factory exported from `src/index.ts`:

```
AgentFlowPlugin({ directory }): {
  'session.created': hook,
  'session.idle': hook,
  'session.error': hook,
  'tool.execute.before': hook,
  'tool.execute.after': hook,
  'message.updated': hook,
  tool: { agentflow_events, agentflow_sessions, agentflow_stats }
}
```

## Event types logged

`start` | `complete` | `dispatch` | `task` | `error` | `message`

Each event written atomically (tmp file + rename) to `.agent-flow/data/{sessionId}.json` as an `events[]` array.

## Tool-to-agent mapping (flow graph)

Tool executions are mapped to agent identities for flow visualization:

| Tool | Agent identity |
|------|---------------|
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
| *args has `agent`* | overrides the mapped name |

If `args.agent` is a string, it takes precedence over the tool map.

## Subagent detection

When tool is `task` or `todowrite` and `args.subagent_type` is set, a `dispatch` event is logged automatically — no separate hook needed.

## Custom tools (queryable by agents)

| Tool | Returns |
|------|---------|
| `agentflow_events(sessionId?, limit?)` | Events for session (or latest across all sessions), sorted newest-first |
| `agentflow_sessions()` | List of all session IDs + count |
| `agentflow_stats(sessionId?)` | Event counts by type, by agent, total, error count, time range |

Result payloads are truncated: `result` string at 200 chars, message content at 300 chars.

## Gotchas

- **Peer dependency:** `@opencode-ai/plugin` — provided by OpenCode runtime, not installed here
- **Storage:** local JSON files only — no external database, no server
- **Atomic writes:** `writeFileSync` to `.tmp` then `renameSync` — safe against partial writes
- **`.agent-flow/config.json`** contains `wsPort: 3001` — used by external dashboard
- **Message dedup:** assistant messages logged once per ID via `Set`
- **Skill loading:** tool `skill` with `name !== 'agent-flow'` logged as `message` type event, not `task`
