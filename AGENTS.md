# AGENTS.md

## Project identity

Agent Flow Plugin — OpenCode plugin for automatic agent/subagent monitoring.
Zero agent cooperation. Hooks into OpenCode events, writes to `.agent-flow/data/`.

## Install

```bash
# Local plugin (instant)
mkdir -p .opencode/plugins/agent-flow
cp src/index.ts .opencode/plugins/agent-flow/
cp -r src/hooks src/store src/tools src/types.ts .opencode/plugins/agent-flow/
cp package.json .opencode/plugins/agent-flow/
```

## Structure

```
src/
├── index.ts          # AgentFlowPlugin export
├── types.ts          # AgentEvent, PluginContext
├── hooks/            # session, tool, message hooks
├── store/            # PluginStore — writes .agent-flow/data/
└── tools/            # agentflow_events, _sessions, _stats
```

## Build

```bash
npm install
npx tsc -p tsconfig.json
```

Output goes to root: `index.js`, `hooks/*.js`, `store/*.js`, `tools/*.js`, `types.js`.

## How it works

1. Copy to `.opencode/plugins/agent-flow/` (project) or `~/.config/opencode/plugins/` (global)
2. OpenCode auto-discovers the plugin at startup
3. Plugin hooks into `session.created`, `tool.execute.*`, `message.updated`
4. Events written to `.agent-flow/data/{sessionId}.json`
5. No server needed — plugin runs inside OpenCode

## Event types logged

`start` | `complete` | `dispatch` | `task` | `error` | `message`

## Gotchas

- Plugin requires `@opencode-ai/plugin` (peer dependency — provided by OpenCode)
- Storage is local JSON files — no external database
- Atomic writes via tmp file + rename
