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

test('deduplicates against raw event ids from the initial snapshot', () => {
  const projector = createTraceProjector({
    run: {
      id: 'run_session_1',
      title: 'Run session_1',
      rootSessionId: 'session_1',
      status: 'running',
      startedAt: 100,
      lastSeenAt: 100,
    },
    lastSequence: 3,
    rawEvents: [event({ id: 'same' })],
    normalizedEvents: [],
    traceNodes: [],
    timelineItems: [],
    graph: { nodes: [], edges: [] },
  })

  const result = projector.applyRawEvent(event({ id: 'same' }))

  expect(result.patches).toHaveLength(0)
  expect(result.snapshot.rawEvents).toHaveLength(1)
  expect(result.snapshot.lastSequence).toBe(3)
})

test('emits immutable patch payloads', () => {
  const projector = createTraceProjector()
  const first = projector.applyRawEvent(event({
    id: 'first',
    timestamp: 100,
    type: 'tool.end',
    tool: 'bash',
  }))
  const runPatch = first.patches.find((patch) => patch.type === 'run.updated')

  projector.applyRawEvent(event({
    id: 'idle',
    timestamp: 200,
    type: 'session.idle',
  }))

  expect(runPatch?.payload).toMatchObject({
    status: 'running',
    lastSeenAt: 100,
  })
})

test('isolates returned snapshots from projector internals', () => {
  const projector = createTraceProjector()
  const result = projector.applyRawEvent(event({
    id: 'bash_done',
    type: 'tool.end',
    tool: 'bash',
  }))

  result.snapshot.run.status = 'error'
  result.snapshot.rawEvents.length = 0

  const snapshot = projector.getSnapshot()

  expect(snapshot?.run.status).toBe('running')
  expect(snapshot?.rawEvents).toHaveLength(1)
})

test('uses raw event ids for timeline event ids', () => {
  const projector = createTraceProjector()
  const result = projector.applyRawEvent(event({
    id: 'bash_done',
    type: 'tool.end',
    tool: 'bash',
  }))

  expect(result.snapshot.timelineItems[0].eventId).toBe('bash_done')
})

test('ignores malformed task delegation input in graph projection', () => {
  const projector = createTraceProjector()

  expect(() => projector.applyRawEvent(event({
    id: 'bad_delegate',
    type: 'tool.start',
    tool: 'task',
    input: { subagent_type: 42, description: 'Bad' },
  }))).not.toThrow()

  expect(projector.getSnapshot()?.graph.nodes.some((node) => node.id === '42')).toBe(false)
})
