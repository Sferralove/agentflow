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
