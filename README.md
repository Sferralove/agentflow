# Agent Flow Plugin

OpenCode plugin for **automatic** agent/subagent flow monitoring — zero agent cooperation required.

## Install

### Option A: Local plugin (instant)

```bash
mkdir -p .opencode/plugins/agent-flow
cp src/* .opencode/plugins/agent-flow/
cp -r src/hooks .opencode/plugins/agent-flow/
cp -r src/store .opencode/plugins/agent-flow/
cp -r src/tools .opencode/plugins/agent-flow/
cp package.json .opencode/plugins/agent-flow/
```

### Option B: npm (when published)

```json
// opencode.json
{ "plugin": ["agent-flow-plugin"] }
```

## How it works

Hooks into OpenCode events — agents don't need to know they're being monitored:

| Hook | Captures |
|------|----------|
| `session.created` | Session start |
| `session.idle` | All work complete |
| `session.error` | Errors |
| `tool.execute.before` | Tool execution (delegates subagents) |
| `tool.execute.after` | Tool completed (success/failure) |
| `message.updated` | Agent responses |

All events written to `.agent-flow/data/{sessionId}.json`.

## Custom tools

| Tool | Description |
|------|-------------|
| `agentflow_events` | Query monitoring events |
| `agentflow_sessions` | List all sessions |
| `agentflow_stats` | Usage statistics |

## Project structure

```
src/
├── index.ts          # AgentFlowPlugin export
├── types.ts          # Shared types
├── hooks/
│   ├── session.ts    # session.created, idle, error
│   ├── tool.ts       # tool.execute.before/after
│   └── message.ts    # message.updated
├── store/
│   └── index.ts      # writes .agent-flow/data/{sessionId}.json
└── tools/
    └── index.ts      # agentflow_events, _sessions, _stats
```
