# Agent Flow Plugin — OpenCode agent monitor

Automatic agent/subagent activity monitor + real-time React dashboard. Hooks into OpenCode events, writes JSON to `.agent-flow/data/`. Zero agent cooperation needed.

## Build

```bash
npm install
npm run build    # tsc + vite (plugin + dashboard)
```

**Build output:**
- `dist/` — compiled plugin JS (entry: `dist/index.js` + `dist/start-dashboard.js`)
- `dist/dashboard/` — static React dashboard (served by dashboard server at runtime)

## Usage

### 1. Install in your project

```bash
npm install @sferralove/agent-flow-plugin
```

### 2. Configure plugin

**opencode.json** (nella root del progetto target):
```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@sferralove/agent-flow-plugin"]
}
```

OpenCode scarica automaticamente il pacchetto + dipendenze in `~/.cache/opencode/packages/`. \
**Devi lanciare `opencode` dalla directory del progetto** per far sì che legga `opencode.json`.

### 3. Start dashboard

```bash
npx @sferralove/agent-flow-plugin
```

Apri `http://localhost:3001` per vedere:

- **Flow Graph** — reactflow canvas showing agents as nodes, dispatch delegations as edges
- **Timeline** — real-time scrollable event list, color-coded by type (via file watcher)
- **Session selector** — switch between monitored sessions via dropdown or `?session=` URL param

Puoi cambiare porta con `PORT=3002 npx @sferralove/agent-flow-plugin`.

## Quick install (local plugin, dev)

Solo per sviluppare il plugin stesso (non per progetti esterni):

```bash
npm run build
mkdir -p .opencode/plugins/agent-flow
cp package.json .opencode/plugins/agent-flow/
cp -r dist/ .opencode/plugins/agent-flow/
cd .opencode/plugins/agent-flow && npm install --production
```

**Nota:** `npm run build` DEVE essere eseguito prima — il plugin necessita di compilazione TypeScript + build dashboard Vite. `dist/` contiene tutto il necessario per il runtime (JS compilato, non TS).

## Architecture

- **Plugin** (`dist/index.js`) — hooks into OpenCode events, writes events to `.agent-flow/data/`
- **Dashboard** (`dist/start-dashboard.js`) — standalone server, reads data files, serves React UI + WebSocket

The plugin logs events autonomously. The dashboard is started separately and watches for new data files.

## Plugin API shape

Plugin factory exported from `src/index.ts`:

```
export const server({ directory }): {
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
- **Runtime deps:** `express`, `ws` — required by dashboard server, installed via `npm install`
- **Storage:** local JSON files only — no external database
- **Atomic writes:** `writeFileSync` to `.tmp` then `renameSync` — safe against partial writes
- **Port conflict:** if port 3001 is in use, dashboard server logs error but monitoring continues unaffected
- **Message dedup:** assistant messages logged once per ID via `Set`
- **Skill loading:** tool `skill` with `name !== 'agent-flow'` logged as `message` type event, not `task`
- **Event cap:** dashboard keeps max 1000 events in memory, older events still on disk
