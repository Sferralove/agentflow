import { expect, test } from 'bun:test'
import { filterTimelineEvents, getPathAgentIds } from '../dashboard/src/utils/timeline.js'
import type { AgentEdge, AgentEvent, AgentNode } from '../dashboard/src/types.js'

const nodes: AgentNode[] = [
  { id: 'builder', name: 'Builder', type: 'main', status: 'running', sessionId: 's1', startedAt: 1, tasksCompleted: 0, tasksFailed: 0 },
  { id: 'frontend', name: 'Frontend', type: 'subagent', parentId: 'builder', status: 'running', sessionId: 's2', startedAt: 2, tasksCompleted: 0, tasksFailed: 0 },
  { id: 'tester', name: 'Tester', type: 'subagent', parentId: 'frontend', status: 'running', sessionId: 's3', startedAt: 3, tasksCompleted: 0, tasksFailed: 0 },
]
const edges: AgentEdge[] = [
  { id: 'e1', source: 'builder', target: 'frontend', description: 'frontend' },
  { id: 'e2', source: 'frontend', target: 'tester', description: 'tester' },
]
const events: AgentEvent[] = [
  { id: 'a', type: 'tool.end', sessionId: 's1', timestamp: 1, agent: 'builder', tool: 'task' },
  { id: 'b', type: 'tool.end', sessionId: 's2', timestamp: 2, agent: 'frontend', tool: 'bash' },
  { id: 'c', type: 'tool.end', sessionId: 's3', timestamp: 3, agent: 'tester', tool: 'edit', error: 'failed' },
]

test('returns the selected graph path agents for timeline context', () => {
  expect([...getPathAgentIds(nodes, edges, 'frontend')]).toEqual([
    'frontend',
    'builder',
    'tester',
  ])
})

test('filters events by quick filter and path scope', () => {
  const pathAgentIds = getPathAgentIds(nodes, edges, 'frontend')

  expect(filterTimelineEvents(events, 'bash', pathAgentIds).map((event) => event.id)).toEqual(['b'])
  expect(filterTimelineEvents(events, 'errors', pathAgentIds).map((event) => event.id)).toEqual(['c'])
  expect(filterTimelineEvents(events, 'files', pathAgentIds).map((event) => event.id)).toEqual(['c'])
})
