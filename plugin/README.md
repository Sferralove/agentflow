# Agent Flow Plugin

Automatic OpenCode monitoring plugin — captures ALL agent activity without requiring explicit cooperation.

## Install

### From npm (recommended)

1. Add to `opencode.json`:
```json
{
  "plugin": ["agent-flow-plugin"]
}
```

2. Start the dashboard server:
```bash
npx agent-flow serve
```

### Local plugin

Copy `plugin/src/index.ts` → `.opencode/plugins/agent-flow.ts`

## How it works

The plugin hooks into OpenCode events:

| Hook | Captures |
|------|----------|
| `session.created` | Session start |
| `session.idle` | Work complete |
| `session.error` | Errors |
| `tool.execute.before` | Tool about to run → delegates subagents, loads skills |
| `tool.execute.after` | Tool completed → success/failure, duration |
| `message.updated` | Agent responses |

All events written to `.agent-flow/data/{sessionId}.json` — same format as the MCP+Skill version.

## Custom tools

The plugin adds tools agents can call:

- `agentflow_events` — Query events for a session
- `agentflow_sessions` — List all monitored sessions
- `agentflow_stats` — Get monitoring statistics

## vs MCP+Skill approach

| | Plugin | MCP+Skill |
|---|---|---|
| Agent cooperation | Not needed | Required |
| Setup | Add to config | Install + init + serve |
| Completeness | 100% of activity | Only what agents log |
| Maintenance | Hook into OpenCode API | Custom MCP server |
