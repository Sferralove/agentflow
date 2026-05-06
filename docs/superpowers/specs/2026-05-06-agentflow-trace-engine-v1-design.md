# AgentFlow Trace Engine v1 - Design Spec

**Date:** 2026-05-06  
**Status:** Approved for implementation planning  
**Goal:** Evolve AgentFlow from a session/event dashboard into a local, live, verifiable execution trace for AI agent work.

## 1. Product Direction

AgentFlow exists to show what normally stays hidden between a user request and the agent's final delivery: operations, tasks, delegations, tool calls, file changes, commands, errors, recoveries, and observable reasoning artifacts.

The product should feel premium because it presents the work as a coherent execution trace, not because it decorates raw logs. The primary experience is a live task tree that narrates the work as it unfolds. The timeline remains the chronological source of precision. The agent graph remains a structural view for delegations and subagent activity.

Core product rules:

- Local-first. No cloud backend, accounts, sync, or remote persistence.
- One active run per workspace.
- SSE for live updates.
- Raw JSONL remains the source of truth.
- Derived snapshots and patches are local, cacheable, and regenerable.
- No hidden chain-of-thought reconstruction.
- Reasoning shown in the UI must come from observable artifacts: plans, explicit updates, task descriptions, commands, file activity, errors, recoveries, and final response.
- Inferred nodes are allowed only when marked with confidence and backed by source event IDs.

## 2. Target Experience

The dashboard opens on the current run, not on a session selector.

```txt
Current Run
  User input
  Work trace
    Task tree
    Evidence detail
    Timeline
    Agent graph
  Final delivery
```

Main layout:

```txt
Header
  Run title, status, duration, connection state

Main
  Verifiable Task Tree

Right Panel
  Evidence for selected trace node:
    source events
    tool calls
    command output
    file path
    duration
    errors

Bottom or Secondary Panel
  Chronological timeline synchronized with selected task

Graph View
  Secondary view for delegation and subagent structure
```

Interaction model:

- Selecting a task tree node filters timeline and evidence to that node's source events.
- Selecting a timeline item highlights the corresponding task tree node.
- Selecting an agent shows the work associated with that agent instance.
- Errors are visible by default and expandable.
- The final response is shown as the closing artifact of the run.

## 3. Architecture

The existing plugin, Bun server, JSONL transport, SSE stream, and React dashboard remain. The refactor is incremental, but the first milestone is vertical: new core plus new task-tree UX.

Target pipeline:

```txt
Plugin JSONL
  -> RawEventReader
  -> EventNormalizer
  -> ActiveRunManager
  -> TraceProjector
      -> TaskTreeReadModel
      -> TimelineReadModel
      -> GraphReadModel
  -> SnapshotWriter
  -> SsePatchStream
  -> Dashboard
```

The server should stop treating graph construction as a direct endpoint concern. Instead, it maintains a live read model for the active run and emits typed patches to connected dashboards.

## 4. Module Layout

New modules:

```txt
src/ingest/
  eventNormalizer.ts
  rawEventReader.ts

src/run/
  activeRunManager.ts
  runStore.ts

src/trace/
  traceTypes.ts
  traceProjector.ts
  timelineProjector.ts
  graphProjector.ts

src/stream/
  patchTypes.ts
  sseHub.ts
```

Existing modules stay in place:

- `src/plugin.ts` continues writing JSONL.
- `src/server.ts` remains the Bun HTTP entry point, but delegates ingest, projection, storage, and stream responsibilities.
- Existing endpoint behavior remains available during migration where practical.

## 5. Local Storage

Raw events remain append-only. Derived files support fast refresh, replay, and stream resume.

```txt
.agentflow/
  active-run.json

  raw/
    sessions/
      <sessionId>.jsonl

  runs/
    <runId>/
      run.json
      snapshot.json
      patches.jsonl

  indexes/
    runs.json
```

Compatibility note: the current `.agentflow/sessions/<sessionId>.jsonl` location may be read during migration. New writes can remain there initially, with the raw reader abstracting over both the current and target paths.

## 6. Core Data Model

### Run

```ts
interface Run {
  id: string
  title: string
  rootSessionId: string
  status: 'running' | 'completed' | 'error' | 'interrupted'
  startedAt: number
  completedAt?: number
  lastSeenAt: number
  userInput?: RunArtifact
  finalResponse?: RunArtifact
}

interface RunArtifact {
  text: string
  timestamp: number
  sourceEventIds: string[]
  confidence: 'observed' | 'inferred' | 'missing'
}
```

### Normalized Event

```ts
interface NormalizedEvent {
  id: string
  runId: string
  sessionId: string
  sequence: number
  timestamp: number
  kind:
    | 'user.input'
    | 'session.lifecycle'
    | 'tool.started'
    | 'tool.completed'
    | 'delegation.started'
    | 'delegation.completed'
    | 'file.changed'
    | 'command.executed'
    | 'error.detected'
    | 'final.response'
  agentInstanceId?: string
  toolCallId?: string
  parentId?: string
  payload: Record<string, unknown>
  rawEventId: string
}
```

### Trace Node

```ts
interface TraceNode {
  id: string
  runId: string
  kind:
    | 'user_input'
    | 'agent_work'
    | 'delegation'
    | 'tool_invocation'
    | 'file_operation'
    | 'command'
    | 'error'
    | 'final_response'
  parentId?: string
  title: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'stale'
  startedAt?: number
  endedAt?: number
  sessionId?: string
  agentInstanceId?: string
  sourceEventIds: string[]
  confidence: 'observed' | 'inferred'
}
```

### Patch Envelope

```ts
interface PatchEnvelope<T = unknown> {
  id: string
  runId: string
  sequence: number
  emittedAt: number
  type:
    | 'raw.event'
    | 'timeline.item.upserted'
    | 'trace.node.upserted'
    | 'trace.node.completed'
    | 'graph.node.upserted'
    | 'graph.edge.upserted'
    | 'run.updated'
  payload: T
}
```

## 7. Active Run Behavior

AgentFlow supports one active run per workspace.

Run creation:

- If a user input event is observed and no active run exists, create a run.
- If only tool/session events are observed, create an inferred active run so live viewing still works.
- The run title is derived from observed user input when available; otherwise it falls back to a timestamp/session label.

Run completion:

- A final response event closes the run when available.
- A session idle event can mark the run completed if no better final response signal exists.
- A session error marks the run error unless later events show recovery.

Restart behavior:

- On server start, read `active-run.json`.
- Load the latest `snapshot.json` for that run if present.
- Tail raw JSONL from the last known offset or sequence.
- Deduplicate by raw event ID and normalized event ID.

## 8. Projection Rules

The trace projector is deterministic. It does not invent intent.

Rules:

- User input becomes the first root trace node when observed.
- Tool start creates or updates a running tool invocation node.
- Tool completion completes the matching invocation when a call ID is available; otherwise it falls back to the best session/agent/tool match.
- Task tool calls create delegation nodes.
- Child session activity can be attached to delegation nodes when session correlation is known or confidently inferred.
- Bash commands become command nodes.
- Write/edit tools become file operation nodes.
- Errors become error nodes and mark the relevant parent node failed.
- Subsequent successful edits or commands after an error may be grouped under a recovery-like inferred parent only if the source events are adjacent and clearly related.
- Final response becomes the closing root trace node when observed.

Every projected node must include `sourceEventIds`.

## 9. SSE And Resume

The live stream sends typed patches, not only raw events.

Endpoint:

```txt
GET /api/stream?run=current&after=<sequence>
```

Behavior:

- `after` is optional.
- If omitted, the server may send the current snapshot followed by live patches.
- If provided, the server sends patches with `sequence > after`.
- Patches are also appended to `patches.jsonl` for local resume.

This replaces client-side graph polling for the new dashboard path.

## 10. API

New endpoints:

```txt
GET /api/runs
GET /api/runs/current
GET /api/runs/:runId
GET /api/runs/:runId/snapshot
GET /api/runs/:runId/events
GET /api/runs/:runId/trace
GET /api/runs/:runId/graph
GET /api/stream?run=current&after=<sequence>
```

Compatibility endpoints:

```txt
GET /api/sessions
GET /api/events?session=<sessionId>
GET /api/agents/<sessionId>
```

Compatibility endpoints can read from existing read models or from raw session files during migration. They should not block the new run-first dashboard design.

## 11. Dashboard Scope

The first vertical milestone includes the new dashboard experience.

Required views:

- Current run header.
- Task tree as the primary surface.
- Evidence detail panel for selected node.
- Timeline synchronized with selected task.
- Graph as a secondary view or tab.
- Empty/loading states for no active run, inferred run, disconnected stream, and completed run.

Required behavior:

- Apply SSE patches incrementally.
- Load snapshot on refresh.
- Resume stream from `lastSequence`.
- Avoid duplicate timeline/tree rows after reconnect.
- Keep graph and task tree synchronized by source event IDs or trace node IDs.

## 12. Testing Strategy

Core tests:

- Event normalization for current plugin events.
- Active run creation from observed and inferred starts.
- Run completion from final response, idle, and error cases.
- Tool start/end matching and deduplication.
- Trace projection for commands, file operations, delegations, and errors.
- Patch sequencing and resume after sequence.
- Snapshot load and incremental continuation.

Dashboard tests:

- Snapshot renders task tree, timeline, and graph.
- Patch stream upserts nodes without duplicates.
- Selecting tree nodes filters timeline/evidence.
- Error nodes are visible and expandable.
- Empty and disconnected states are clear.

Verification command remains:

```bash
npm run build
```

`npm run test` should be used when Bun is installed.

## 13. Migration Plan

This is an incremental refactor, not a rewrite.

1. Add new types and deterministic projectors without changing plugin behavior.
2. Add active run storage and snapshots.
3. Add typed SSE patches while keeping raw event streaming available as needed.
4. Add new run-first API endpoints.
5. Replace dashboard session-first experience with current-run task tree.
6. Keep legacy endpoints temporarily.
7. Remove or simplify old graph/session code once the new read model covers the existing use cases.

## 14. Open Implementation Notes

- Capturing user input and final response depends on what OpenCode exposes. If unavailable, the run must mark those artifacts as `missing` or `inferred`.
- Session correlation should be improved but does not need multi-run support in v1 because only one active run exists per workspace.
- Agent instance IDs should avoid collisions between repeated agent types.
- The current plugin's `ToolTimer` should feed normalized tool invocation duration.
- Snapshot writes should be debounced to avoid excessive disk writes during busy runs.
