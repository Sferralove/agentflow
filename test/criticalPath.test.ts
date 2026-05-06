import { expect, test } from 'bun:test'
import { computeCriticalPath } from '../dashboard/src/utils/criticalPath.js'
import type { AgentEdge, AgentEvent, AgentNode } from '../dashboard/src/types.js'

test('computes the longest graph path from completed tool durations', () => {
  const nodes: AgentNode[] = [
    {
      id: 'main',
      name: 'Main',
      type: 'main',
      status: 'completed',
      sessionId: 's-main',
      startedAt: 1,
      tasksCompleted: 2,
      tasksFailed: 0,
    },
    {
      id: 'fast',
      name: 'Fast',
      type: 'subagent',
      parentId: 'main',
      status: 'completed',
      sessionId: 's-fast',
      startedAt: 2,
      tasksCompleted: 1,
      tasksFailed: 0,
    },
    {
      id: 'slow',
      name: 'Slow',
      type: 'subagent',
      parentId: 'main',
      status: 'completed',
      sessionId: 's-slow',
      startedAt: 3,
      tasksCompleted: 1,
      tasksFailed: 0,
    },
  ]
  const edges: AgentEdge[] = [
    { id: 'main-fast', source: 'main', target: 'fast', description: 'fast branch' },
    { id: 'main-slow', source: 'main', target: 'slow', description: 'slow branch' },
  ]
  const events: AgentEvent[] = [
    { id: 'e1', type: 'tool.end', sessionId: 's-main', timestamp: 1, agent: 'main', tool: 'task', duration: 400 },
    { id: 'e2', type: 'tool.end', sessionId: 's-fast', timestamp: 2, agent: 'fast', tool: 'bash', duration: 600 },
    { id: 'e3', type: 'tool.end', sessionId: 's-slow', timestamp: 3, agent: 'slow', tool: 'bash', duration: 1600 },
  ]

  const criticalPath = computeCriticalPath(nodes, edges, events)

  expect(criticalPath.durationMs).toBe(2000)
  expect([...criticalPath.nodeIds]).toEqual(['main', 'slow'])
  expect([...criticalPath.edgeIds]).toEqual(['main-slow'])
})
