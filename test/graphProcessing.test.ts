import { expect, test } from 'bun:test'
import { applyEventToGraph, buildGraphFromEvents, classifySessions } from '../src/server.js'
import type { AgentEvent, SessionGraph } from '../src/types.js'

function evt(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'evt',
    type: 'tool.end',
    sessionId: 'session-a',
    timestamp: 1,
    agent: 'builder',
    ...overrides,
  } as AgentEvent
}

test('file and shell tool results update the emitting agent metrics', () => {
  const graph: SessionGraph = { nodes: [], edges: [] }

  applyEventToGraph(graph, evt({ id: 'start', type: 'tool.start', tool: 'bash' }))
  applyEventToGraph(graph, evt({ id: 'done', type: 'tool.end', tool: 'bash', duration: 500 }))
  applyEventToGraph(graph, evt({ id: 'fail', type: 'tool.end', tool: 'edit', error: 'failed' }))

  expect(graph.nodes).toHaveLength(1)
  expect(graph.nodes[0].id).toBe('builder')
  expect(graph.nodes[0].tasksCompleted).toBe(1)
  expect(graph.nodes[0].tasksFailed).toBe(1)
  expect(graph.nodes[0].status).toBe('error')
})

test('task delegation starts the target subagent without completing the parent', () => {
  const graph: SessionGraph = { nodes: [], edges: [] }

  applyEventToGraph(
    graph,
    evt({
      id: 'delegate-start',
      type: 'tool.start',
      tool: 'task',
      input: { subagent_type: 'frontend-dev', description: 'Build UI' },
    }),
  )
  applyEventToGraph(graph, evt({ id: 'delegate-end', type: 'tool.end', tool: 'task' }))

  const builder = graph.nodes.find((node) => node.id === 'builder')
  const frontend = graph.nodes.find((node) => node.id === 'frontend-dev')

  expect(builder?.status).toBe('running')
  expect(frontend?.status).toBe('running')
  expect(builder?.tasksCompleted).toBe(1)
  expect(graph.edges).toHaveLength(1)
})

test('classifies the parent session from delegation events instead of filename order', () => {
  const sessions = classifySessions({
    'z-parent': [
      evt({
        id: 'delegate',
        sessionId: 'z-parent',
        type: 'tool.start',
        tool: 'task',
        input: { subagent_type: 'frontend-dev' },
      }),
    ],
    'a-child': [
      evt({
        id: 'child',
        sessionId: 'a-child',
        type: 'tool.start',
        agent: 'frontend-dev',
        tool: 'bash',
      }),
    ],
  })

  expect(sessions).toEqual([
    { id: 'z-parent', type: 'parent' },
    { id: 'a-child', type: 'child' },
  ])
})

test('builds a unified graph with child session metrics merged into delegated subagents', () => {
  const graph = buildGraphFromEvents([
    evt({
      id: 'delegate',
      sessionId: 'parent-session',
      type: 'tool.start',
      tool: 'task',
      input: { subagent_type: 'frontend-dev', description: 'Build UI' },
    }),
    evt({
      id: 'child-start',
      sessionId: 'child-session',
      type: 'tool.start',
      agent: 'frontend-dev',
      tool: 'bash',
    }),
    evt({
      id: 'child-end',
      sessionId: 'child-session',
      type: 'tool.end',
      agent: 'frontend-dev',
      tool: 'bash',
      duration: 900,
    }),
  ])

  const frontend = graph.nodes.find((node) => node.id === 'frontend-dev')

  expect(graph.edges).toEqual([
    {
      id: 'delegate',
      source: 'builder',
      target: 'frontend-dev',
      description: 'Build UI',
    },
  ])
  expect(frontend?.type).toBe('subagent')
  expect(frontend?.parentId).toBe('builder')
  expect(frontend?.sessionId).toBe('child-session')
  expect(frontend?.tasksCompleted).toBe(1)
})

test('reclassifies an existing tool-emitting node as subagent when delegation arrives later', () => {
  const graph = buildGraphFromEvents([
    evt({
      id: 'child-start',
      sessionId: 'child-session',
      timestamp: 1,
      type: 'tool.start',
      agent: 'frontend-dev',
      tool: 'bash',
    }),
    evt({
      id: 'delegate',
      sessionId: 'parent-session',
      timestamp: 2,
      type: 'tool.start',
      tool: 'task',
      input: { subagent_type: 'frontend-dev', description: 'Build UI' },
    }),
  ])

  const frontend = graph.nodes.find((node) => node.id === 'frontend-dev')

  expect(frontend?.type).toBe('subagent')
  expect(frontend?.parentId).toBe('builder')
  expect(frontend?.sessionId).toBe('child-session')
  expect(graph.edges).toHaveLength(1)
})

test('stores node activity timestamps from event timestamps', () => {
  const graph: SessionGraph = { nodes: [], edges: [] }

  applyEventToGraph(graph, evt({ id: 'start', timestamp: 100, type: 'tool.start', tool: 'bash' }))
  applyEventToGraph(graph, evt({ id: 'end', timestamp: 450, type: 'tool.end', tool: 'bash' }))

  expect(graph.nodes[0].startedAt).toBe(100)
  expect(graph.nodes[0].lastSeenAt).toBe(450)
  expect(graph.nodes[0].completedAt).toBe(450)
})
