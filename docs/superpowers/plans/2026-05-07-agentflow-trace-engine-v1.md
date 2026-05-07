# AgentFlow Trace Engine v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local, live, verifiable execution trace that shows the agent workflow from user input through task tree, timeline, graph, and final delivery.

**Architecture:** Keep the existing plugin JSONL writer, Bun server, SSE transport, and React dashboard, but add a run-first trace engine under the server. Raw events remain the source of truth; normalized events, trace nodes, graph nodes, timeline items, snapshots, and SSE patches are derived read models.

**Tech Stack:** TypeScript, Bun, React 18, Vite, ReactFlow, Tailwind, `bun:test`.

---

## File Structure

Create focused core modules:

```txt
src/trace/traceTypes.ts          # Core run, normalized event, trace, timeline, graph, patch types
src/trace/eventNormalizer.ts     # Convert current AgentEvent JSONL records into NormalizedEvent records
src/trace/traceProjector.ts      # Incrementally project normalized events into run snapshot + patches
src/run/runStore.ts              # Local filesystem storage for active run, snapshots, patches, indexes
src/stream/sseHub.ts             # SSE client registry, replay, and patch broadcast
```

Modify existing server and exports:

```txt
src/server.ts                    # Use TraceProjector, RunStore, SseHub and expose run-first APIs
src/index.ts                     # Export new trace modules where useful
```

Modify dashboard:

```txt
dashboard/src/types.ts           # Mirror trace types needed by UI
dashboard/src/hooks/useRunTrace.ts
dashboard/src/App.tsx
dashboard/src/components/Header.tsx
dashboard/src/components/TraceTree.tsx
dashboard/src/components/TraceEvidencePanel.tsx
dashboard/src/components/TraceTimeline.tsx
dashboard/src/components/AgentGraph.tsx
```

Add tests:

```txt
test/traceTypes.test.ts
test/eventNormalizer.test.ts
test/traceProjector.test.ts
test/runStore.test.ts
test/ssePatch.test.ts
```

---

### Task 1: Core Trace Types

**Files:**
- Create: `src/trace/traceTypes.ts`
- Modify: `src/index.ts`
- Test: `test/traceTypes.test.ts`

- [ ] **Step 1: Write the failing type/runtime helper test**

Create `test/traceTypes.test.ts`:

```ts
import { expect, test } from 'bun:test'
import {
  createPatchEnvelope,
  emptyRunSnapshot,
  makeTraceNodeId,
} from '../src/trace/traceTypes.js'

test('creates stable trace node ids from kind and source ids', () => {
  expect(makeTraceNodeId('command', ['evt_a'])).toBe('trace_command_evt_a')
  expect(makeTraceNodeId('file_operation', ['evt_a', 'evt_b'])).toBe('trace_file_operation_evt_a_evt_b')
})

test('creates an empty run snapshot with consistent collections', () => {
  const snapshot = emptyRunSnapshot({
    id: 'run_1',
    title: 'Current run',
    rootSessionId: 'session_1',
    status: 'running',
    startedAt: 100,
    lastSeenAt: 100,
  })

  expect(snapshot.run.id).toBe('run_1')
  expect(snapshot.lastSequence).toBe(0)
  expect(snapshot.traceNodes).toEqual([])
  expect(snapshot.timelineItems).toEqual([])
  expect(snapshot.graph.nodes).toEqual([])
  expect(snapshot.graph.edges).toEqual([])
})

test('creates sequenced patch envelopes', () => {
  const patch = createPatchEnvelope({
    id: 'patch_1',
    runId: 'run_1',
    sequence: 7,
    emittedAt: 120,
    type: 'run.updated',
    payload: { status: 'running' },
  })

  expect(patch.sequence).toBe(7)
  expect(patch.type).toBe('run.updated')
  expect(patch.payload).toEqual({ status: 'running' })
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/traceTypes.test.ts
```

Expected: FAIL because `src/trace/traceTypes.ts` does not exist.

- [ ] **Step 3: Implement trace types and helpers**

Create `src/trace/traceTypes.ts`:

```ts
import type { AgentEdge, AgentNode, AgentEvent, SessionGraph } from '../types.js'

export type RunStatus = 'running' | 'completed' | 'error' | 'interrupted'
export type ArtifactConfidence = 'observed' | 'inferred' | 'missing'
export type TraceConfidence = 'observed' | 'inferred'
export type TraceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale'

export interface RunArtifact {
  text: string
  timestamp: number
  sourceEventIds: string[]
  confidence: ArtifactConfidence
}

export interface Run {
  id: string
  title: string
  rootSessionId: string
  status: RunStatus
  startedAt: number
  completedAt?: number
  lastSeenAt: number
  userInput?: RunArtifact
  finalResponse?: RunArtifact
}

export type NormalizedEventKind =
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

export interface NormalizedEvent {
  id: string
  runId: string
  sessionId: string
  sequence: number
  timestamp: number
  kind: NormalizedEventKind
  agentInstanceId?: string
  toolCallId?: string
  parentId?: string
  payload: Record<string, unknown>
  rawEventId: string
  raw: AgentEvent
}

export type TraceNodeKind =
  | 'user_input'
  | 'agent_work'
  | 'delegation'
  | 'tool_invocation'
  | 'file_operation'
  | 'command'
  | 'error'
  | 'final_response'

export interface TraceNode {
  id: string
  runId: string
  kind: TraceNodeKind
  parentId?: string
  title: string
  status: TraceStatus
  startedAt?: number
  endedAt?: number
  sessionId?: string
  agentInstanceId?: string
  sourceEventIds: string[]
  confidence: TraceConfidence
}

export interface TimelineItem {
  id: string
  runId: string
  traceNodeId?: string
  eventId: string
  timestamp: number
  title: string
  detail?: string
  kind: NormalizedEventKind
  status: TraceStatus
  sourceEventIds: string[]
}

export type PatchType =
  | 'raw.event'
  | 'timeline.item.upserted'
  | 'trace.node.upserted'
  | 'trace.node.completed'
  | 'graph.node.upserted'
  | 'graph.edge.upserted'
  | 'run.updated'

export interface PatchEnvelope<T = unknown> {
  id: string
  runId: string
  sequence: number
  emittedAt: number
  type: PatchType
  payload: T
}

export interface RunSnapshot {
  run: Run
  lastSequence: number
  rawEvents: AgentEvent[]
  normalizedEvents: NormalizedEvent[]
  traceNodes: TraceNode[]
  timelineItems: TimelineItem[]
  graph: SessionGraph
}

export interface ProjectionResult {
  snapshot: RunSnapshot
  patches: PatchEnvelope[]
}

export function makeTraceNodeId(kind: TraceNodeKind, sourceEventIds: string[]): string {
  return `trace_${kind}_${sourceEventIds.join('_')}`
}

export function createPatchEnvelope<T>(patch: PatchEnvelope<T>): PatchEnvelope<T> {
  return patch
}

export function emptyRunSnapshot(run: Run): RunSnapshot {
  return {
    run,
    lastSequence: 0,
    rawEvents: [],
    normalizedEvents: [],
    traceNodes: [],
    timelineItems: [],
    graph: { nodes: [] as AgentNode[], edges: [] as AgentEdge[] },
  }
}
```

Modify `src/index.ts`:

```ts
export { server, AgentFlowPlugin } from './plugin.js'
export { startServer, stopServer } from './server.js'
export type * from './types.js'
export type * from './trace/traceTypes.js'
export {
  createPatchEnvelope,
  emptyRunSnapshot,
  makeTraceNodeId,
} from './trace/traceTypes.js'
```

- [ ] **Step 4: Run the test**

Run:

```bash
bun test test/traceTypes.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trace/traceTypes.ts src/index.ts test/traceTypes.test.ts
git commit -m "feat: define trace engine core types"
```

---

### Task 2: Event Normalizer

**Files:**
- Create: `src/trace/eventNormalizer.ts`
- Test: `test/eventNormalizer.test.ts`

- [ ] **Step 1: Write failing normalizer tests**

Create `test/eventNormalizer.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { normalizeAgentEvent } from '../src/trace/eventNormalizer.js'
import type { AgentEvent } from '../src/types.js'

function event(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'evt_1',
    type: 'tool.start',
    sessionId: 'session_1',
    timestamp: 100,
    agent: 'builder',
    ...overrides,
  } as AgentEvent
}

test('normalizes task start as delegation start', () => {
  const normalized = normalizeAgentEvent({
    raw: event({
      id: 'delegate_1',
      type: 'tool.start',
      tool: 'task',
      input: { subagent_type: 'frontend-dev', description: 'Build UI' },
    }),
    runId: 'run_1',
    sequence: 4,
  })

  expect(normalized.kind).toBe('delegation.started')
  expect(normalized.agentInstanceId).toBe('session_1:builder')
  expect(normalized.payload.subagentType).toBe('frontend-dev')
  expect(normalized.payload.title).toBe('Build UI')
})

test('normalizes bash completion as command execution', () => {
  const normalized = normalizeAgentEvent({
    raw: event({
      id: 'bash_1',
      type: 'tool.end',
      tool: 'bash',
      duration: 1200,
      output: 'ok',
    }),
    runId: 'run_1',
    sequence: 5,
  })

  expect(normalized.kind).toBe('command.executed')
  expect(normalized.payload.duration).toBe(1200)
  expect(normalized.payload.output).toBe('ok')
})

test('normalizes write and edit as file changes', () => {
  const write = normalizeAgentEvent({
    raw: event({
      id: 'write_1',
      type: 'tool.start',
      tool: 'write',
      input: { filePath: 'src/server.ts' },
    }),
    runId: 'run_1',
    sequence: 6,
  })

  expect(write.kind).toBe('file.changed')
  expect(write.payload.filePath).toBe('src/server.ts')
})

test('normalizes session error as error detected', () => {
  const normalized = normalizeAgentEvent({
    raw: event({
      id: 'error_1',
      type: 'session.error',
      tool: undefined,
      error: 'failed',
    }),
    runId: 'run_1',
    sequence: 7,
  })

  expect(normalized.kind).toBe('error.detected')
  expect(normalized.payload.error).toBe('failed')
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/eventNormalizer.test.ts
```

Expected: FAIL because `normalizeAgentEvent` does not exist.

- [ ] **Step 3: Implement normalizer**

Create `src/trace/eventNormalizer.ts`:

```ts
import type { AgentEvent } from '../types.js'
import type { NormalizedEvent, NormalizedEventKind } from './traceTypes.js'

interface NormalizeInput {
  raw: AgentEvent
  runId: string
  sequence: number
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function agentInstanceId(raw: AgentEvent): string {
  return `${raw.sessionId}:${raw.agent || 'builder'}`
}

function inferKind(raw: AgentEvent): NormalizedEventKind {
  if (raw.type === 'session.error' || raw.error) return 'error.detected'
  if (raw.type.startsWith('session.')) return 'session.lifecycle'
  if (raw.tool === 'task' && raw.type === 'tool.start') return 'delegation.started'
  if (raw.tool === 'task' && raw.type === 'tool.end') return 'delegation.completed'
  if (raw.tool === 'bash' && raw.type === 'tool.end') return 'command.executed'
  if (raw.tool === 'write' || raw.tool === 'edit') return 'file.changed'
  if (raw.type === 'tool.start') return 'tool.started'
  if (raw.type === 'tool.end') return 'tool.completed'
  return 'session.lifecycle'
}

function titleFor(raw: AgentEvent): string {
  const description = asString(raw.input?.description)
  const command = asString(raw.input?.command)
  const filePath = asString(raw.input?.filePath)
  const subagentType = asString(raw.input?.subagent_type)
  return description || command || filePath || subagentType || raw.tool || raw.type
}

export function normalizeAgentEvent({ raw, runId, sequence }: NormalizeInput): NormalizedEvent {
  const kind = inferKind(raw)
  const payload: Record<string, unknown> = {
    title: titleFor(raw),
    tool: raw.tool,
    input: raw.input,
    output: raw.output,
    error: raw.error,
    duration: raw.duration,
  }

  const command = asString(raw.input?.command)
  const filePath = asString(raw.input?.filePath)
  const subagentType = asString(raw.input?.subagent_type)
  if (command) payload.command = command
  if (filePath) payload.filePath = filePath
  if (subagentType) payload.subagentType = subagentType

  return {
    id: `norm_${raw.id}`,
    runId,
    sessionId: raw.sessionId,
    sequence,
    timestamp: raw.timestamp,
    kind,
    agentInstanceId: agentInstanceId(raw),
    toolCallId: raw.id,
    payload,
    rawEventId: raw.id,
    raw,
  }
}
```

- [ ] **Step 4: Run the test**

Run:

```bash
bun test test/eventNormalizer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/trace/eventNormalizer.ts test/eventNormalizer.test.ts
git commit -m "feat: normalize agent events for trace projection"
```

---

### Task 3: Trace Projector

**Files:**
- Create: `src/trace/traceProjector.ts`
- Test: `test/traceProjector.test.ts`

- [ ] **Step 1: Write failing projector tests**

Create `test/traceProjector.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { createTraceProjector } from '../src/trace/traceProjector.js'
import type { AgentEvent } from '../src/types.js'

function event(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'evt',
    type: 'tool.start',
    sessionId: 'session_1',
    timestamp: 100,
    agent: 'builder',
    ...overrides,
  } as AgentEvent
}

test('creates an inferred active run and command trace node from raw events', () => {
  const projector = createTraceProjector()
  const result = projector.applyRawEvent(event({
    id: 'bash_done',
    type: 'tool.end',
    tool: 'bash',
    duration: 500,
    output: 'ok',
  }))

  expect(result.snapshot.run.status).toBe('running')
  expect(result.snapshot.traceNodes.map((node) => node.kind)).toContain('command')
  expect(result.snapshot.timelineItems).toHaveLength(1)
  expect(result.patches.some((patch) => patch.type === 'trace.node.upserted')).toBe(true)
})

test('deduplicates raw events by id', () => {
  const projector = createTraceProjector()
  const raw = event({ id: 'same', type: 'tool.end', tool: 'bash' })

  projector.applyRawEvent(raw)
  const second = projector.applyRawEvent(raw)

  expect(second.patches).toHaveLength(0)
  expect(second.snapshot.rawEvents).toHaveLength(1)
})

test('projects task delegation into graph edge and delegation node', () => {
  const projector = createTraceProjector()
  const result = projector.applyRawEvent(event({
    id: 'delegate',
    type: 'tool.start',
    tool: 'task',
    input: { subagent_type: 'frontend-dev', description: 'Build UI' },
  }))

  expect(result.snapshot.traceNodes.some((node) => node.kind === 'delegation')).toBe(true)
  expect(result.snapshot.graph.nodes.some((node) => node.id === 'frontend-dev')).toBe(true)
  expect(result.snapshot.graph.edges).toEqual([
    {
      id: 'delegate',
      source: 'builder',
      target: 'frontend-dev',
      description: 'Build UI',
    },
  ])
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/traceProjector.test.ts
```

Expected: FAIL because `createTraceProjector` does not exist.

- [ ] **Step 3: Implement projector**

Create `src/trace/traceProjector.ts`:

```ts
import type { AgentEvent, SessionGraph } from '../types.js'
import { applyEventToGraph } from '../server.js'
import { normalizeAgentEvent } from './eventNormalizer.js'
import {
  createPatchEnvelope,
  emptyRunSnapshot,
  makeTraceNodeId,
  type PatchEnvelope,
  type ProjectionResult,
  type Run,
  type RunSnapshot,
  type TraceNode,
  type TraceNodeKind,
  type TraceStatus,
} from './traceTypes.js'

function createRun(raw: AgentEvent): Run {
  return {
    id: `run_${raw.sessionId}`,
    title: `Run ${raw.sessionId.slice(-8)}`,
    rootSessionId: raw.sessionId,
    status: 'running',
    startedAt: raw.timestamp,
    lastSeenAt: raw.timestamp,
  }
}

function traceKind(raw: AgentEvent): TraceNodeKind {
  if (raw.type === 'session.error' || raw.error) return 'error'
  if (raw.tool === 'task') return 'delegation'
  if (raw.tool === 'bash') return 'command'
  if (raw.tool === 'write' || raw.tool === 'edit') return 'file_operation'
  if (raw.type === 'session.idle') return 'final_response'
  return 'tool_invocation'
}

function traceStatus(raw: AgentEvent): TraceStatus {
  if (raw.error || raw.type === 'session.error') return 'failed'
  if (raw.type === 'tool.start') return 'running'
  if (raw.type === 'tool.end' || raw.type === 'session.idle') return 'completed'
  return 'running'
}

function traceTitle(raw: AgentEvent): string {
  const input = raw.input || {}
  const description = typeof input.description === 'string' ? input.description : undefined
  const command = typeof input.command === 'string' ? input.command : undefined
  const filePath = typeof input.filePath === 'string' ? input.filePath : undefined
  const subagent = typeof input.subagent_type === 'string' ? input.subagent_type : undefined
  if (description) return description
  if (command) return command
  if (filePath) return filePath
  if (subagent) return `Delegate to ${subagent}`
  if (raw.tool) return `${raw.tool} ${raw.type === 'tool.start' ? 'started' : 'completed'}`
  return raw.type
}

function upsertTraceNode(snapshot: RunSnapshot, raw: AgentEvent): TraceNode {
  const kind = traceKind(raw)
  const id = makeTraceNodeId(kind, [raw.id])
  const existing = snapshot.traceNodes.find((node) => node.id === id)
  const node: TraceNode = existing || {
    id,
    runId: snapshot.run.id,
    kind,
    title: traceTitle(raw),
    status: traceStatus(raw),
    startedAt: raw.timestamp,
    sessionId: raw.sessionId,
    agentInstanceId: `${raw.sessionId}:${raw.agent}`,
    sourceEventIds: [raw.id],
    confidence: 'observed',
  }

  node.status = traceStatus(raw)
  node.endedAt = raw.type === 'tool.end' || raw.error || raw.type === 'session.idle'
    ? raw.timestamp
    : node.endedAt

  if (!existing) snapshot.traceNodes.push(node)
  return node
}

function nextPatch<T>(
  snapshot: RunSnapshot,
  type: PatchEnvelope<T>['type'],
  payload: T,
): PatchEnvelope<T> {
  snapshot.lastSequence += 1
  return createPatchEnvelope({
    id: `patch_${snapshot.lastSequence}`,
    runId: snapshot.run.id,
    sequence: snapshot.lastSequence,
    emittedAt: Date.now(),
    type,
    payload,
  })
}

export function createTraceProjector(initial?: RunSnapshot) {
  let snapshot: RunSnapshot | null = initial || null
  const seenRawEventIds = new Set(initial?.rawEvents.map((event) => event.id) || [])

  function ensureSnapshot(raw: AgentEvent): RunSnapshot {
    if (!snapshot) snapshot = emptyRunSnapshot(createRun(raw))
    return snapshot
  }

  return {
    getSnapshot(): RunSnapshot | null {
      return snapshot
    },

    applyRawEvent(raw: AgentEvent): ProjectionResult {
      const current = ensureSnapshot(raw)
      if (seenRawEventIds.has(raw.id)) {
        return { snapshot: current, patches: [] }
      }
      seenRawEventIds.add(raw.id)

      current.rawEvents.push(raw)
      current.run.lastSeenAt = Math.max(current.run.lastSeenAt, raw.timestamp)
      if (raw.error || raw.type === 'session.error') current.run.status = 'error'
      if (raw.type === 'session.idle' && current.run.status !== 'error') {
        current.run.status = 'completed'
        current.run.completedAt = raw.timestamp
      }

      const normalized = normalizeAgentEvent({
        raw,
        runId: current.run.id,
        sequence: current.normalizedEvents.length + 1,
      })
      current.normalizedEvents.push(normalized)

      const node = upsertTraceNode(current, raw)
      current.timelineItems.push({
        id: `timeline_${raw.id}`,
        runId: current.run.id,
        traceNodeId: node.id,
        eventId: raw.id,
        timestamp: raw.timestamp,
        title: node.title,
        kind: normalized.kind,
        status: node.status,
        sourceEventIds: [raw.id],
      })

      const graph: SessionGraph = current.graph
      applyEventToGraph(graph, raw)

      const patches: PatchEnvelope[] = [
        nextPatch(current, 'raw.event', raw),
        nextPatch(current, 'trace.node.upserted', node),
        nextPatch(current, 'timeline.item.upserted', current.timelineItems[current.timelineItems.length - 1]),
        nextPatch(current, 'run.updated', current.run),
      ]

      for (const graphNode of graph.nodes) {
        patches.push(nextPatch(current, 'graph.node.upserted', graphNode))
      }
      for (const graphEdge of graph.edges) {
        patches.push(nextPatch(current, 'graph.edge.upserted', graphEdge))
      }

      return { snapshot: current, patches }
    },
  }
}
```

- [ ] **Step 4: Run projector tests**

Run:

```bash
bun test test/traceProjector.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run existing graph tests**

Run:

```bash
bun test test/graphProcessing.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/trace/traceProjector.ts test/traceProjector.test.ts
git commit -m "feat: project raw events into trace snapshots"
```

---

### Task 4: Local Run Store

**Files:**
- Create: `src/run/runStore.ts`
- Test: `test/runStore.test.ts`

- [ ] **Step 1: Write failing run store tests**

Create `test/runStore.test.ts`:

```ts
import { mkdirSync, rmSync } from 'node:fs'
import { expect, test } from 'bun:test'
import { createRunStore } from '../src/run/runStore.js'
import { emptyRunSnapshot } from '../src/trace/traceTypes.js'

const root = '/tmp/agentflow-run-store-test'

function clean() {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(root, { recursive: true })
}

test('writes and reads active run snapshot and patches', async () => {
  clean()
  const store = createRunStore(root)
  const snapshot = emptyRunSnapshot({
    id: 'run_1',
    title: 'Run 1',
    rootSessionId: 'session_1',
    status: 'running',
    startedAt: 100,
    lastSeenAt: 100,
  })

  await store.writeActiveRun(snapshot.run)
  await store.writeSnapshot(snapshot)
  await store.appendPatches([
    {
      id: 'patch_1',
      runId: 'run_1',
      sequence: 1,
      emittedAt: 101,
      type: 'run.updated',
      payload: snapshot.run,
    },
  ])

  expect(await store.readActiveRun()).toEqual(snapshot.run)
  expect((await store.readSnapshot('run_1'))?.run.id).toBe('run_1')
  expect(await store.readPatchesAfter('run_1', 0)).toHaveLength(1)
  expect(await store.readPatchesAfter('run_1', 1)).toHaveLength(0)
})
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
bun test test/runStore.test.ts
```

Expected: FAIL because `createRunStore` does not exist.

- [ ] **Step 3: Implement run store**

Create `src/run/runStore.ts`:

```ts
import { mkdirSync, existsSync } from 'node:fs'
import type { PatchEnvelope, Run, RunSnapshot } from '../trace/traceTypes.js'

function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true })
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return await Bun.file(path).json() as T
  } catch {
    return null
  }
}

export function createRunStore(root: string = '.agentflow') {
  const runsDir = `${root}/runs`
  const indexesDir = `${root}/indexes`
  ensureDir(runsDir)
  ensureDir(indexesDir)

  function runDir(runId: string): string {
    return `${runsDir}/${runId}`
  }

  return {
    async writeActiveRun(run: Run): Promise<void> {
      ensureDir(root)
      await Bun.write(`${root}/active-run.json`, JSON.stringify(run, null, 2))
    },

    async readActiveRun(): Promise<Run | null> {
      return readJson<Run>(`${root}/active-run.json`)
    },

    async writeSnapshot(snapshot: RunSnapshot): Promise<void> {
      ensureDir(runDir(snapshot.run.id))
      await Bun.write(`${runDir(snapshot.run.id)}/snapshot.json`, JSON.stringify(snapshot, null, 2))
      await Bun.write(`${runDir(snapshot.run.id)}/run.json`, JSON.stringify(snapshot.run, null, 2))
    },

    async readSnapshot(runId: string): Promise<RunSnapshot | null> {
      return readJson<RunSnapshot>(`${runDir(runId)}/snapshot.json`)
    },

    async appendPatches(patches: PatchEnvelope[]): Promise<void> {
      if (patches.length === 0) return
      ensureDir(runDir(patches[0].runId))
      const path = `${runDir(patches[0].runId)}/patches.jsonl`
      const existing = existsSync(path) ? await Bun.file(path).text() : ''
      const next = patches.map((patch) => JSON.stringify(patch)).join('\n')
      await Bun.write(path, existing + next + '\n')
    },

    async readPatchesAfter(runId: string, sequence: number): Promise<PatchEnvelope[]> {
      try {
        const text = await Bun.file(`${runDir(runId)}/patches.jsonl`).text()
        return text
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as PatchEnvelope)
          .filter((patch) => patch.sequence > sequence)
      } catch {
        return []
      }
    },
  }
}
```

- [ ] **Step 4: Run run store tests**

Run:

```bash
bun test test/runStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/run/runStore.ts test/runStore.test.ts
git commit -m "feat: persist active run snapshots and patches"
```

---

### Task 5: SSE Patch Hub

**Files:**
- Create: `src/stream/sseHub.ts`
- Test: `test/ssePatch.test.ts`

- [ ] **Step 1: Write failing SSE hub tests**

Create `test/ssePatch.test.ts`:

```ts
import { expect, test } from 'bun:test'
import { createSseHub } from '../src/stream/sseHub.js'
import type { PatchEnvelope } from '../src/trace/traceTypes.js'

test('stores patches and replays patches after sequence', () => {
  const hub = createSseHub()
  const patch: PatchEnvelope = {
    id: 'patch_1',
    runId: 'run_1',
    sequence: 1,
    emittedAt: 100,
    type: 'run.updated',
    payload: { status: 'running' },
  }

  hub.publish([patch])

  expect(hub.getPatchesAfter('run_1', 0)).toEqual([patch])
  expect(hub.getPatchesAfter('run_1', 1)).toEqual([])
})
```

- [ ] **Step 2: Run failing test**

Run:

```bash
bun test test/ssePatch.test.ts
```

Expected: FAIL because `createSseHub` does not exist.

- [ ] **Step 3: Implement SSE hub**

Create `src/stream/sseHub.ts`:

```ts
import type { PatchEnvelope } from '../trace/traceTypes.js'

type SseController = ReadableStreamDefaultController

export function createSseHub() {
  const clients = new Map<string, Set<SseController>>()
  const history = new Map<string, PatchEnvelope[]>()

  function enqueue(controller: SseController, patch: PatchEnvelope): void {
    controller.enqueue(`id: ${patch.sequence}\n`)
    controller.enqueue(`event: ${patch.type}\n`)
    controller.enqueue(`data: ${JSON.stringify(patch)}\n\n`)
  }

  return {
    addClient(runId: string, controller: SseController): void {
      if (!clients.has(runId)) clients.set(runId, new Set())
      clients.get(runId)!.add(controller)
    },

    removeClient(runId: string, controller: SseController): void {
      clients.get(runId)?.delete(controller)
      if (clients.get(runId)?.size === 0) clients.delete(runId)
    },

    publish(patches: PatchEnvelope[]): void {
      for (const patch of patches) {
        history.set(patch.runId, [...(history.get(patch.runId) || []), patch])
        for (const controller of clients.get(patch.runId) || []) {
          try { enqueue(controller, patch) } catch {}
        }
      }
    },

    replay(runId: string, after: number, controller: SseController): void {
      for (const patch of this.getPatchesAfter(runId, after)) enqueue(controller, patch)
    },

    getPatchesAfter(runId: string, after: number): PatchEnvelope[] {
      return (history.get(runId) || []).filter((patch) => patch.sequence > after)
    },
  }
}
```

- [ ] **Step 4: Run SSE hub tests**

Run:

```bash
bun test test/ssePatch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stream/sseHub.ts test/ssePatch.test.ts
git commit -m "feat: stream typed trace patches over sse"
```

---

### Task 6: Run-First Server APIs

**Files:**
- Modify: `src/server.ts`
- Test: `test/smoke.test.ts`
- Test: `test/graphProcessing.test.ts`

- [ ] **Step 1: Add server API smoke tests**

Extend `test/smoke.test.ts` with pure projector assertions if HTTP server testing is not already structured:

```ts
import { expect, test } from 'bun:test'
import { createTraceProjector } from '../src/trace/traceProjector.js'

test('run snapshot supports run-first API shape', () => {
  const projector = createTraceProjector()
  const result = projector.applyRawEvent({
    id: 'evt_1',
    type: 'tool.end',
    sessionId: 'session_1',
    timestamp: 100,
    agent: 'builder',
    tool: 'bash',
    duration: 20,
    error: null,
  })

  expect(result.snapshot.run.id).toBe('run_session_1')
  expect(result.snapshot.lastSequence).toBeGreaterThan(0)
  expect(result.snapshot.traceNodes.length).toBeGreaterThan(0)
  expect(result.snapshot.timelineItems.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Run smoke tests**

Run:

```bash
bun test test/smoke.test.ts
```

Expected: PASS if the projector shape from Task 3 is present.

- [ ] **Step 3: Integrate projector, store, and hub into server**

Modify `src/server.ts` carefully:

- Keep `applyEventToGraph`, `buildGraphFromEvents`, and `classifySessions` exports for existing tests.
- Create module-level instances:

```ts
import { createTraceProjector } from './trace/traceProjector.js'
import { createRunStore } from './run/runStore.js'
import { createSseHub } from './stream/sseHub.js'

const traceProjector = createTraceProjector()
const runStore = createRunStore('.agentflow')
const sseHub = createSseHub()
```

- In the file watcher, after parsing each `evt`, keep existing behavior and add:

```ts
const projection = traceProjector.applyRawEvent(evt)
runStore.writeActiveRun(projection.snapshot.run).catch(() => {})
runStore.writeSnapshot(projection.snapshot).catch(() => {})
runStore.appendPatches(projection.patches).catch(() => {})
sseHub.publish(projection.patches)
```

- Add run-first routes before legacy routes:

```ts
if (url.pathname === '/api/runs/current') {
  const snapshot = traceProjector.getSnapshot()
  if (!snapshot) {
    return new Response(JSON.stringify({ run: null }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
  return new Response(JSON.stringify(snapshot), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/snapshot')) {
  const runId = sanitizeSessionId(url.pathname.replace('/api/runs/', '').replace('/snapshot', ''))
  const snapshot = await runStore.readSnapshot(runId)
  return new Response(JSON.stringify(snapshot || { run: null }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

if (url.pathname === '/api/runs') {
  const snapshot = traceProjector.getSnapshot()
  return new Response(JSON.stringify({
    runs: snapshot ? [snapshot.run] : [],
  }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
```

- Update `/api/stream` so `run=current` uses typed patches while `session=` keeps legacy behavior:

```ts
const runParam = url.searchParams.get('run')
if (url.pathname === '/api/stream' && runParam) {
  const snapshot = traceProjector.getSnapshot()
  const runId = runParam === 'current' ? snapshot?.run.id : sanitizeSessionId(runParam)
  if (!runId) return new Response('No active run', { status: 404, headers: corsHeaders })
  const after = parseInt(url.searchParams.get('after') || '0', 10)

  const stream = new ReadableStream({
    start(controller) {
      sseHub.addClient(runId, controller)
      sseHub.replay(runId, Number.isFinite(after) ? after : 0, controller)
    },
    cancel(controller) {
      sseHub.removeClient(runId, controller)
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...corsHeaders,
    },
  })
}
```

- [ ] **Step 4: Run existing server tests**

Run:

```bash
bun test test/smoke.test.ts test/graphProcessing.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server.ts test/smoke.test.ts
git commit -m "feat: expose run-first trace server APIs"
```

---

### Task 7: Dashboard Trace Types And Hook

**Files:**
- Modify: `dashboard/src/types.ts`
- Create: `dashboard/src/hooks/useRunTrace.ts`

- [ ] **Step 1: Add dashboard trace types**

Modify `dashboard/src/types.ts` by appending:

```ts
export type RunStatus = 'running' | 'completed' | 'error' | 'interrupted';
export type TraceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

export interface RunArtifact {
  text: string;
  timestamp: number;
  sourceEventIds: string[];
  confidence: 'observed' | 'inferred' | 'missing';
}

export interface Run {
  id: string;
  title: string;
  rootSessionId: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  lastSeenAt: number;
  userInput?: RunArtifact;
  finalResponse?: RunArtifact;
}

export interface TraceNode {
  id: string;
  runId: string;
  kind:
    | 'user_input'
    | 'agent_work'
    | 'delegation'
    | 'tool_invocation'
    | 'file_operation'
    | 'command'
    | 'error'
    | 'final_response';
  parentId?: string;
  title: string;
  status: TraceStatus;
  startedAt?: number;
  endedAt?: number;
  sessionId?: string;
  agentInstanceId?: string;
  sourceEventIds: string[];
  confidence: 'observed' | 'inferred';
}

export interface TimelineItem {
  id: string;
  runId: string;
  traceNodeId?: string;
  eventId: string;
  timestamp: number;
  title: string;
  detail?: string;
  kind: string;
  status: TraceStatus;
  sourceEventIds: string[];
}

export interface RunSnapshot {
  run: Run;
  lastSequence: number;
  rawEvents: AgentEvent[];
  normalizedEvents: unknown[];
  traceNodes: TraceNode[];
  timelineItems: TimelineItem[];
  graph: SessionGraph;
}

export interface PatchEnvelope<T = unknown> {
  id: string;
  runId: string;
  sequence: number;
  emittedAt: number;
  type:
    | 'raw.event'
    | 'timeline.item.upserted'
    | 'trace.node.upserted'
    | 'trace.node.completed'
    | 'graph.node.upserted'
    | 'graph.edge.upserted'
    | 'run.updated';
  payload: T;
}
```

- [ ] **Step 2: Add useRunTrace hook**

Create `dashboard/src/hooks/useRunTrace.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentEdge,
  AgentNode,
  Run,
  RunSnapshot,
  TimelineItem,
  TraceNode,
  PatchEnvelope,
} from '../types';

const EMPTY_GRAPH = { nodes: [] as AgentNode[], edges: [] as AgentEdge[] };

function applyPatch(snapshot: RunSnapshot, patch: PatchEnvelope): RunSnapshot {
  if (patch.type === 'run.updated') {
    return { ...snapshot, run: patch.payload as Run, lastSequence: patch.sequence };
  }
  if (patch.type === 'trace.node.upserted' || patch.type === 'trace.node.completed') {
    const node = patch.payload as TraceNode;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      traceNodes: [
        ...snapshot.traceNodes.filter((item) => item.id !== node.id),
        node,
      ],
    };
  }
  if (patch.type === 'timeline.item.upserted') {
    const item = patch.payload as TimelineItem;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      timelineItems: [
        ...snapshot.timelineItems.filter((existing) => existing.id !== item.id),
        item,
      ].sort((a, b) => a.timestamp - b.timestamp),
    };
  }
  if (patch.type === 'graph.node.upserted') {
    const node = patch.payload as AgentNode;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      graph: {
        ...snapshot.graph,
        nodes: [...snapshot.graph.nodes.filter((item) => item.id !== node.id), node],
      },
    };
  }
  if (patch.type === 'graph.edge.upserted') {
    const edge = patch.payload as AgentEdge;
    return {
      ...snapshot,
      lastSequence: patch.sequence,
      graph: {
        ...snapshot.graph,
        edges: [...snapshot.graph.edges.filter((item) => item.id !== edge.id), edge],
      },
    };
  }
  return { ...snapshot, lastSequence: Math.max(snapshot.lastSequence, patch.sequence) };
}

export function useRunTrace() {
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSequence = useRef(0);

  const loadSnapshot = useCallback(() => {
    fetch('/api/runs/current')
      .then((response) => response.json())
      .then((data) => {
        if (!data || !data.run) {
          setSnapshot(null);
          return;
        }
        setSnapshot(data as RunSnapshot);
        lastSequence.current = (data as RunSnapshot).lastSequence || 0;
      })
      .catch(() => setError('Unable to load current run'));
  }, []);

  useEffect(() => {
    loadSnapshot();
  }, [loadSnapshot]);

  useEffect(() => {
    const source = new EventSource(`/api/stream?run=current&after=${lastSequence.current}`);
    source.onopen = () => {
      setConnected(true);
      setError(null);
    };
    source.onerror = () => {
      setConnected(false);
      setError('Trace stream disconnected');
    };
    source.onmessage = (message) => {
      const patch = JSON.parse(message.data) as PatchEnvelope;
      lastSequence.current = Math.max(lastSequence.current, patch.sequence);
      setSnapshot((current) => {
        if (!current) return current;
        return applyPatch(current, patch);
      });
    };
    source.addEventListener('run.updated', (message) => {
      const patch = JSON.parse((message as MessageEvent).data) as PatchEnvelope;
      lastSequence.current = Math.max(lastSequence.current, patch.sequence);
      setSnapshot((current) => current ? applyPatch(current, patch) : current);
    });
    return () => {
      source.close();
      setConnected(false);
    };
  }, []);

  return {
    snapshot,
    connected,
    error,
    graph: snapshot?.graph || EMPTY_GRAPH,
    traceNodes: snapshot?.traceNodes || [],
    timelineItems: snapshot?.timelineItems || [],
    run: snapshot?.run || null,
  };
}
```

- [ ] **Step 3: Run dashboard typecheck**

Run:

```bash
npm -C dashboard run build
```

Expected: PASS or unrelated existing build issues only.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/types.ts dashboard/src/hooks/useRunTrace.ts
git commit -m "feat: add dashboard trace stream hook"
```

---

### Task 8: Task Tree, Evidence, And Timeline UI

**Files:**
- Create: `dashboard/src/components/TraceTree.tsx`
- Create: `dashboard/src/components/TraceEvidencePanel.tsx`
- Create: `dashboard/src/components/TraceTimeline.tsx`
- Modify: `dashboard/src/App.tsx`
- Modify: `dashboard/src/components/Header.tsx`

- [ ] **Step 1: Create TraceTree component**

Create `dashboard/src/components/TraceTree.tsx`:

```tsx
import type { TraceNode } from '../types';

const STATUS_CLASS: Record<string, string> = {
  pending: 'border-gray-700 bg-gray-900 text-gray-400',
  running: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  failed: 'border-red-500/40 bg-red-500/10 text-red-200',
  stale: 'border-gray-700 bg-gray-900 text-gray-500',
};

interface TraceTreeProps {
  nodes: TraceNode[];
  selectedId: string | null;
  onSelect: (node: TraceNode) => void;
}

export default function TraceTree({ nodes, selectedId, onSelect }: TraceTreeProps) {
  const rootNodes = nodes.filter((node) => !node.parentId);
  const childNodes = new Map<string, TraceNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    childNodes.set(node.parentId, [...(childNodes.get(node.parentId) || []), node]);
  }

  const renderNode = (node: TraceNode, depth: number) => (
    <div key={node.id}>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`w-full border-b border-gray-800 px-4 py-3 text-left transition-colors hover:bg-gray-900/80 ${
          selectedId === node.id ? 'bg-blue-500/10' : 'bg-transparent'
        }`}
        style={{ paddingLeft: `${16 + depth * 18}px` }}
      >
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${STATUS_CLASS[node.status]}`}>
            {node.status}
          </span>
          <span className="truncate text-sm font-medium text-gray-100">{node.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-600">
          <span>{node.kind.replace('_', ' ')}</span>
          <span>{node.confidence}</span>
          <span>{node.sourceEventIds.length} evidence</span>
        </div>
      </button>
      {(childNodes.get(node.id) || []).map((child) => renderNode(child, depth + 1))}
    </div>
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-600">
        Waiting for trace events
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950/60">
      {rootNodes.map((node) => renderNode(node, 0))}
    </div>
  );
}
```

- [ ] **Step 2: Create evidence panel**

Create `dashboard/src/components/TraceEvidencePanel.tsx`:

```tsx
import type { AgentEvent, TraceNode } from '../types';

interface TraceEvidencePanelProps {
  selectedNode: TraceNode | null;
  events: AgentEvent[];
}

export default function TraceEvidencePanel({ selectedNode, events }: TraceEvidencePanelProps) {
  const evidence = selectedNode
    ? events.filter((event) => selectedNode.sourceEventIds.includes(event.id))
    : [];

  if (!selectedNode) {
    return (
      <aside className="h-full border-l border-gray-800 bg-gray-950/80 px-4 py-4 text-xs text-gray-600">
        Select a trace step to inspect evidence.
      </aside>
    );
  }

  return (
    <aside className="h-full overflow-y-auto border-l border-gray-800 bg-gray-950/80">
      <div className="border-b border-gray-800 px-4 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Evidence</div>
        <div className="mt-1 text-sm font-semibold text-gray-100">{selectedNode.title}</div>
        <div className="mt-1 text-[11px] text-gray-500">
          {selectedNode.kind} · {selectedNode.status} · {selectedNode.confidence}
        </div>
      </div>
      <div className="divide-y divide-gray-800">
        {evidence.map((event) => (
          <div key={event.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-200">{event.tool || event.type}</span>
              <span className="font-mono text-[10px] text-gray-600">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {event.input && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-gray-800 bg-gray-950 px-2 py-2 text-[10px] text-gray-500">
                {JSON.stringify(event.input, null, 2)}
              </pre>
            )}
            {typeof event.output === 'string' && event.output && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-gray-800 bg-gray-950 px-2 py-2 text-[10px] text-gray-400">
                {event.output}
              </pre>
            )}
            {event.error && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-red-500/30 bg-red-950/30 px-2 py-2 text-[10px] text-red-200">
                {event.error}
              </pre>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create trace timeline**

Create `dashboard/src/components/TraceTimeline.tsx`:

```tsx
import type { TimelineItem } from '../types';

interface TraceTimelineProps {
  items: TimelineItem[];
  selectedTraceNodeId: string | null;
  onSelectTraceNode: (traceNodeId: string) => void;
}

export default function TraceTimeline({ items, selectedTraceNodeId, onSelectTraceNode }: TraceTimelineProps) {
  return (
    <div className="h-44 overflow-y-auto border-t border-gray-800 bg-gray-950">
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-gray-600">
          Timeline appears as events arrive.
        </div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => item.traceNodeId && onSelectTraceNode(item.traceNodeId)}
            className={`grid w-full grid-cols-[5.5rem_8rem_minmax(0,1fr)] gap-3 border-b border-gray-800 px-4 py-2 text-left text-xs hover:bg-gray-900/70 ${
              selectedTraceNodeId === item.traceNodeId ? 'bg-blue-500/10' : ''
            }`}
          >
            <span className="font-mono text-[10px] text-gray-600">
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
            <span className="truncate text-[10px] uppercase text-gray-500">{item.kind}</span>
            <span className="truncate text-gray-300">{item.title}</span>
          </button>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update Header for run-first state**

Modify `dashboard/src/components/Header.tsx` to accept optional `runTitle`, `runStatus`, and `durationLabel`. Keep old props optional during migration:

```tsx
interface HeaderProps {
  sessionId?: string;
  sessions?: SessionInfo[];
  isParent?: boolean;
  onSessionChange?: (id: string) => void;
  connected: boolean;
  runTitle?: string;
  runStatus?: string;
  durationLabel?: string;
}
```

Render run-first text when `runTitle` exists:

```tsx
<div className="min-w-0">
  <h1 className="truncate text-sm font-semibold leading-4 text-gray-100">
    {runTitle || 'AgentFlow'}
  </h1>
  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-600">
    {runTitle ? `${runStatus || 'running'} · ${durationLabel || 'live trace'}` : 'Live orchestration monitor'}
  </div>
</div>
```

- [ ] **Step 5: Replace App with run-first layout**

Modify `dashboard/src/App.tsx` to use `useRunTrace`:

```tsx
import { useMemo, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import Header from './components/Header';
import AgentGraph from './components/AgentGraph';
import TraceEvidencePanel from './components/TraceEvidencePanel';
import TraceTimeline from './components/TraceTimeline';
import TraceTree from './components/TraceTree';
import { useRunTrace } from './hooks/useRunTrace';
import type { TraceNode } from './types';
import { computeCriticalPath } from './utils/criticalPath.js';

function durationLabel(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return 'live trace';
  const end = completedAt || Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 1000))}s`;
}

export default function App() {
  const { run, traceNodes, timelineItems, graph, connected, error, snapshot } = useRunTrace();
  const [selectedNode, setSelectedNode] = useState<TraceNode | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  const selectedId = selectedNode?.id || null;
  const criticalPath = useMemo(
    () => computeCriticalPath(graph.nodes, graph.edges, snapshot?.rawEvents || []),
    [graph.nodes, graph.edges, snapshot?.rawEvents],
  );

  const selectedGraphNode = useMemo(() => {
    if (!selectedNode?.agentInstanceId) return null;
    const agentName = selectedNode.agentInstanceId.split(':').slice(1).join(':');
    return graph.nodes.find((node) => node.id === agentName) || null;
  }, [graph.nodes, selectedNode]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#070a12] text-gray-100">
      <Header
        connected={connected}
        runTitle={run?.title || 'Current Run'}
        runStatus={run?.status || 'waiting'}
        durationLabel={durationLabel(run?.startedAt, run?.completedAt)}
      />
      {error && (
        <div className="absolute right-4 top-16 z-30 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(24rem,1fr)_24rem] grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <main className="min-h-0 overflow-hidden border-r border-gray-800">
          <div className="flex h-10 items-center justify-between border-b border-gray-800 bg-[#0b1020] px-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Work Trace
            </div>
            <button
              type="button"
              onClick={() => setShowGraph((value) => !value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-[10px] font-semibold text-gray-400 hover:text-gray-200"
            >
              {showGraph ? 'Tree' : 'Graph'}
            </button>
          </div>
          {showGraph ? (
            <ReactFlowProvider>
              <AgentGraph
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNode={selectedGraphNode}
                criticalPath={criticalPath}
                onNodeSelect={() => {}}
              />
            </ReactFlowProvider>
          ) : (
            <TraceTree nodes={traceNodes} selectedId={selectedId} onSelect={setSelectedNode} />
          )}
        </main>
        <TraceEvidencePanel selectedNode={selectedNode} events={snapshot?.rawEvents || []} />
        <div className="col-span-2">
          <TraceTimeline
            items={timelineItems}
            selectedTraceNodeId={selectedId}
            onSelectTraceNode={(traceNodeId) => {
              const node = traceNodes.find((item) => item.id === traceNodeId);
              if (node) setSelectedNode(node);
            }}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Run dashboard build**

Run:

```bash
npm -C dashboard run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/App.tsx dashboard/src/components/Header.tsx dashboard/src/components/TraceTree.tsx dashboard/src/components/TraceEvidencePanel.tsx dashboard/src/components/TraceTimeline.tsx
git commit -m "feat: add run-first task tree dashboard"
```

---

### Task 9: End-To-End Verification And Polish

**Files:**
- Modify only files touched by failing verification.

- [ ] **Step 1: Run root TypeScript and dashboard build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 2: Run Bun tests if Bun is installed**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 3: Start production server**

Run:

```bash
npm run build
agentflow serve 3001
```

Expected:

```txt
[agentflow] Server started on http://localhost:3001
```

- [ ] **Step 4: Open dashboard manually or with browser plugin**

Open:

```txt
http://localhost:3001
```

Expected:

- Header shows `Current Run` or active run title.
- Empty state appears when no events exist.
- When raw JSONL events exist, task tree, evidence panel, timeline, and graph tab render.
- No browser console errors.

- [ ] **Step 5: Stop server**

Run:

```bash
agentflow stop
```

Expected:

```txt
[agentflow] Server stopped
```

- [ ] **Step 6: Commit verification fixes**

If fixes were required:

```bash
git add src dashboard test
git commit -m "fix: polish trace engine v1 verification"
```

If no fixes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Local-first storage: Task 4.
- One active run: Tasks 3, 4, 6.
- SSE typed patch stream: Task 5 and Task 6.
- Run-first APIs: Task 6.
- Verifiable task tree: Task 3 and Task 8.
- Timeline synchronized with task tree: Task 8.
- Graph remains available as secondary view: Task 8.
- Incremental refactor preserving plugin and legacy graph functions: Tasks 3 and 6.
- Tests for normalization, projection, store, patching, build: Tasks 1-9.

Known implementation risks:

- Capturing true user input and final response depends on OpenCode event payloads. The first implementation supports inferred active runs and leaves observed input/final response for payload-specific follow-up.
- `traceProjector.ts` imports `applyEventToGraph` from `server.ts`; if this creates an import cycle at runtime, extract graph functions to `src/trace/graphProjector.ts` during Task 3 and update tests/imports in the same commit.
- Dashboard `EventSource` custom event handling may require registering listeners for each patch event type. If `onmessage` does not receive named events, add listeners for all `PatchEnvelope['type']` values in Task 7.
