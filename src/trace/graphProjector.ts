import type { AgentEvent, AgentNode, SessionGraph } from '../types.js'

function ensureNode(
  graph: SessionGraph,
  id: string,
  type: 'main' | 'subagent',
  parentId?: string,
  sessionId?: string,
  timestamp: number = Date.now(),
): AgentNode {
  let node = graph.nodes.find(n => n.id === id)
  if (!node) {
    node = {
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type,
      parentId,
      status: 'idle',
      sessionId: sessionId || graph.nodes[0]?.sessionId || '',
      startedAt: timestamp,
      lastSeenAt: timestamp,
      tasksCompleted: 0,
      tasksFailed: 0,
    }
    graph.nodes.push(node)
  } else {
    const wasSubagent = node.type === 'subagent'
    if (type === 'subagent') node.type = 'subagent'
    if (parentId && !node.parentId) node.parentId = parentId
    if (
      sessionId &&
      (
        node.sessionId === '' ||
        (wasSubagent && type === 'main' && node.sessionId !== sessionId)
      )
    ) {
      node.sessionId = sessionId
    }
    node.lastSeenAt = Math.max(node.lastSeenAt || node.startedAt, timestamp)
  }
  return node
}

function updateNodeStatus(graph: SessionGraph, id: string, status: AgentNode['status'], timestamp: number = Date.now()): void {
  const node = graph.nodes.find(n => n.id === id)
  if (!node) return
  node.status = status
  node.lastSeenAt = Math.max(node.lastSeenAt || node.startedAt, timestamp)
  if (status === 'completed' || status === 'error') {
    node.completedAt = timestamp
  }
}

export function applyEventToGraph(graph: SessionGraph, evt: AgentEvent): void {
  if (evt.type === 'tool.start' && evt.tool === 'task' && evt.input) {
    const subagent = evt.input.subagent_type as string
    const description = (evt.input.description as string) || 'delegated task'
    if (!subagent) return

    ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    updateNodeStatus(graph, evt.agent, 'running', evt.timestamp)
    ensureNode(graph, subagent, 'subagent', evt.agent, evt.sessionId, evt.timestamp)
    updateNodeStatus(graph, subagent, 'running', evt.timestamp)

    if (!graph.edges.some(e => e.source === evt.agent && e.target === subagent)) {
      graph.edges.push({
        id: evt.id,
        source: evt.agent,
        target: subagent,
        description,
      })
    }
    return
  }

  if (evt.type === 'tool.start' && evt.tool) {
    ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    updateNodeStatus(graph, evt.agent, 'running', evt.timestamp)
    return
  }

  if (evt.type === 'tool.end' && evt.tool === 'task') {
    const node = ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    if (evt.error) {
      node.tasksFailed++
      updateNodeStatus(graph, evt.agent, 'error', evt.timestamp)
    } else {
      node.tasksCompleted++
      if (node.status === 'idle') updateNodeStatus(graph, evt.agent, 'running', evt.timestamp)
    }
    return
  }

  if (evt.type === 'tool.end' && evt.tool) {
    const node = ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    if (evt.error) {
      node.tasksFailed++
      updateNodeStatus(graph, evt.agent, 'error', evt.timestamp)
    } else {
      node.tasksCompleted++
      updateNodeStatus(graph, evt.agent, 'completed', evt.timestamp)
    }
    return
  }

  if (evt.type === 'session.created') {
    ensureNode(graph, evt.agent || 'builder', 'main', undefined, evt.sessionId, evt.timestamp)
  }
  if (evt.type === 'session.error') {
    updateNodeStatus(graph, evt.agent || 'builder', 'error', evt.timestamp)
  }
  if (evt.type === 'session.compacted') {
    updateNodeStatus(graph, evt.agent || 'builder', 'compacted', evt.timestamp)
  }
  if (evt.type === 'session.idle') {
    if (evt.agent) updateNodeStatus(graph, evt.agent, 'completed', evt.timestamp)
  }
}

export function buildGraphFromEvents(events: AgentEvent[]): SessionGraph {
  const graph: SessionGraph = { nodes: [], edges: [] }
  for (const evt of events.slice().sort((a, b) => a.timestamp - b.timestamp)) {
    applyEventToGraph(graph, evt)
  }
  return graph
}
