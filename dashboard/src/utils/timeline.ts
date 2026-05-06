import type { AgentEdge, AgentEvent, AgentNode } from '../types.js';

export type TimelineFilter = 'all' | 'critical' | 'errors' | 'bash' | 'files' | 'tasks';

export function getPathAgentIds(
  nodes: AgentNode[],
  edges: AgentEdge[],
  selectedId: string | null,
): Set<string> {
  if (!selectedId) return new Set(nodes.map((node) => node.id));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  const addLink = (source: string, target: string) => {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    incoming.set(target, [...(incoming.get(target) || []), source]);
    outgoing.set(source, [...(outgoing.get(source) || []), target]);
  };

  edges.forEach((edge) => addLink(edge.source, edge.target));
  nodes.forEach((node) => {
    if (node.parentId) addLink(node.parentId, node.id);
  });

  const path = new Set([selectedId]);
  const visit = (map: Map<string, string[]>, start: string) => {
    const stack = [...(map.get(start) || [])];
    while (stack.length > 0) {
      const current = stack.shift()!;
      if (path.has(current)) continue;
      path.add(current);
      stack.push(...(map.get(current) || []));
    }
  };

  visit(incoming, selectedId);
  visit(outgoing, selectedId);

  return path;
}

export function filterTimelineEvents(
  events: AgentEvent[],
  filter: TimelineFilter,
  scopeAgentIds?: Set<string>,
  criticalPathAgentIds?: Set<string>,
): AgentEvent[] {
  return events.filter((event) => {
    if (scopeAgentIds && !scopeAgentIds.has(event.agent)) return false;

    if (filter === 'critical') {
      return Boolean(criticalPathAgentIds?.has(event.agent));
    }
    if (filter === 'errors') return Boolean(event.error);
    if (filter === 'bash') return event.tool === 'bash';
    if (filter === 'files') return event.tool === 'write' || event.tool === 'edit';
    if (filter === 'tasks') return event.tool === 'task';

    return true;
  });
}
