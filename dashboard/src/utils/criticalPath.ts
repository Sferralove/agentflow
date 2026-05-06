import type { AgentEdge, AgentEvent, AgentNode } from '../types.js';

export interface CriticalPath {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  durationMs: number;
}

export function computeCriticalPath(
  nodes: AgentNode[],
  edges: AgentEdge[],
  events: AgentEvent[],
): CriticalPath {
  if (nodes.length === 0) {
    return { nodeIds: new Set(), edgeIds: new Set(), durationMs: 0 };
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const durationByAgent = new Map<string, number>();

  for (const event of events) {
    if (
      event.type !== 'tool.end' ||
      event.duration == null ||
      event.duration <= 0 ||
      !nodeIds.has(event.agent)
    ) {
      continue;
    }

    durationByAgent.set(
      event.agent,
      (durationByAgent.get(event.agent) || 0) + event.duration,
    );
  }

  const edgeByPair = new Map<string, AgentEdge>();
  const outgoing = new Map<string, AgentEdge[]>();

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    edgeByPair.set(`${edge.source}:${edge.target}`, edge);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);
  }

  for (const node of nodes) {
    if (
      !node.parentId ||
      !nodeIds.has(node.parentId) ||
      edgeByPair.has(`${node.parentId}:${node.id}`)
    ) {
      continue;
    }

    const edge = {
      id: `parent-${node.parentId}-${node.id}`,
      source: node.parentId,
      target: node.id,
      description: '',
    };
    outgoing.set(node.parentId, [...(outgoing.get(node.parentId) || []), edge]);
  }

  const memo = new Map<string, { durationMs: number; path: string[] }>();
  const visit = (nodeId: string): { durationMs: number; path: string[] } => {
    const cached = memo.get(nodeId);
    if (cached) return cached;

    let bestChild = { durationMs: 0, path: [] as string[] };
    for (const edge of outgoing.get(nodeId) || []) {
      const candidate = visit(edge.target);
      if (candidate.durationMs > bestChild.durationMs) {
        bestChild = candidate;
      }
    }

    const result = {
      durationMs: (durationByAgent.get(nodeId) || 0) + bestChild.durationMs,
      path: [nodeId, ...bestChild.path],
    };
    memo.set(nodeId, result);
    return result;
  };

  let best = { durationMs: -1, path: [] as string[] };
  for (const node of nodes) {
    const candidate = visit(node.id);
    if (candidate.durationMs > best.durationMs) {
      best = candidate;
    }
  }

  const criticalNodeIds = new Set(best.path);
  const criticalEdgeIds = new Set<string>();
  for (let i = 0; i < best.path.length - 1; i++) {
    const edge = edgeByPair.get(`${best.path[i]}:${best.path[i + 1]}`);
    if (edge) criticalEdgeIds.add(edge.id);
  }

  return {
    nodeIds: criticalNodeIds,
    edgeIds: criticalEdgeIds,
    durationMs: Math.max(0, best.durationMs),
  };
}
