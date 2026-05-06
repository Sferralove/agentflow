import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  MarkerType,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';
import type {
  AgentNode as AgentNodeType,
  AgentEdge as AgentEdgeType,
} from '../types';
import { STATUS_COLORS } from '../types';
import type { CriticalPath } from '../utils/criticalPath.js';
import AgentNodeComponent from './AgentNode';

const nodeTypes = { agentNode: AgentNodeComponent };
const NODE_W = 256;
const NODE_H = 132;
const SIBLING_SEP = 72;
const RANK_SEP = 92;

type GraphNodeData = AgentNodeType & {
  isDimmed?: boolean;
  isFocusPath?: boolean;
  isCriticalPath?: boolean;
  isRecentlyActive?: boolean;
};

function getFocusNodeIds(
  nodes: AgentNodeType[],
  edges: AgentEdgeType[],
  selectedId: string | null,
): Set<string> {
  if (!selectedId) return new Set(nodes.map((node) => node.id));

  const nodeIds = new Set(nodes.map((node) => node.id));
  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();

  function addLink(source: string, target: string) {
    if (!nodeIds.has(source) || !nodeIds.has(target)) return;
    incoming.set(target, [...(incoming.get(target) || []), source]);
    outgoing.set(source, [...(outgoing.get(source) || []), target]);
  }

  edges.forEach((edge) => addLink(edge.source, edge.target));
  nodes.forEach((node) => {
    if (node.parentId) addLink(node.parentId, node.id);
  });

  const focused = new Set([selectedId]);
  const visit = (map: Map<string, string[]>, start: string) => {
    const stack = [start];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const next of map.get(current) || []) {
        if (focused.has(next)) continue;
        focused.add(next);
        stack.push(next);
      }
    }
  };

  visit(incoming, selectedId);
  visit(outgoing, selectedId);

  return focused;
}

function layoutNodes(
  nodes: AgentNodeType[],
  edges: AgentEdgeType[],
  selectedId: string | null,
  criticalPath: CriticalPath,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'TB',
    align: 'UL',
    marginx: 64,
    marginy: 72,
    nodesep: SIBLING_SEP,
    ranksep: RANK_SEP,
    edgesep: 32,
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const parentEdgeKeys = new Set(edges.map((e) => `${e.source}:${e.target}`));
  const layoutEdges = [...edges];

  nodes.forEach((node) => {
    if (
      node.type === 'subagent' &&
      node.parentId &&
      nodeById.has(node.parentId) &&
      !parentEdgeKeys.has(`${node.parentId}:${node.id}`)
    ) {
      layoutEdges.push({
        id: `layout-${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        description: '',
      });
    }
  });

  nodes
    .slice()
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'main' ? -1 : 1;
      if (a.parentId !== b.parentId) {
        return (a.parentId || '').localeCompare(b.parentId || '');
      }
      return a.startedAt - b.startedAt;
    })
    .forEach((n) =>
      g.setNode(n.id, {
        width: NODE_W,
        height: NODE_H,
        rank: n.type === 'main' ? 0 : 1,
      }),
    );

  layoutEdges.forEach((e) =>
    g.setEdge(e.source, e.target, {
      minlen: 1,
      weight: nodeById.get(e.target)?.type === 'subagent' ? 8 : 2,
    }),
  );

  dagre.layout(g);
  const focusNodeIds = getFocusNodeIds(nodes, edges, selectedId);
  const hasFocus = Boolean(selectedId);

  const laidNodes: Node<GraphNodeData>[] = nodes.map((n) => {
    const pos = g.node(n.id);
    const isFocusPath = focusNodeIds.has(n.id);
    const isRecentlyActive = Boolean(
      n.lastSeenAt && Date.now() - n.lastSeenAt < 15_000,
    );
    return {
      id: n.id,
      type: 'agentNode',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      selected: n.id === selectedId,
      data: {
        ...n,
        isDimmed: hasFocus && !isFocusPath,
        isFocusPath,
        isCriticalPath: criticalPath.nodeIds.has(n.id),
        isRecentlyActive,
      },
    };
  });

  const laidEdges: Edge[] = edges.map((e) => {
    const target = nodeById.get(e.target);
    const edgeColor = target ? STATUS_COLORS[target.status] : '#64748b';
    const inFocusPath = focusNodeIds.has(e.source) && focusNodeIds.has(e.target);
    const isSelectedLink = e.source === selectedId || e.target === selectedId;
    const isCriticalLink = criticalPath.edgeIds.has(e.id);
    const isDimmed = hasFocus && !inFocusPath;
    const strokeColor = isCriticalLink && !isDimmed ? '#f59e0b' : edgeColor;
    const isActiveLink = target?.status === 'running' || Boolean(
      target?.lastSeenAt && Date.now() - target.lastSeenAt < 15_000,
    );

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: isActiveLink,
      markerEnd: { type: MarkerType.ArrowClosed, color: strokeColor, width: 18, height: 18 },
      pathOptions: { borderRadius: 18 },
      style: {
        stroke: strokeColor,
        strokeOpacity: isDimmed
          ? 0.16
          : isCriticalLink
            ? 0.95
            : isSelectedLink
            ? 1
            : isActiveLink
              ? 0.88
              : 0.56,
        strokeWidth: isCriticalLink || isSelectedLink ? 3 : isActiveLink ? 2.5 : 2,
      },
    };
  });

  return { nodes: laidNodes, edges: laidEdges };
}

interface AgentGraphProps {
  nodes: AgentNodeType[];
  edges: AgentEdgeType[];
  selectedNode: AgentNodeType | null;
  criticalPath: CriticalPath;
  onNodeSelect: (node: AgentNodeType | null) => void;
}

export default function AgentGraph({
  nodes,
  edges,
  selectedNode,
  criticalPath,
  onNodeSelect,
}: AgentGraphProps) {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([]);
  const { fitView } = useReactFlow();
  const selectedId = selectedNode?.id || null;

  const layout = useMemo(
    () => layoutNodes(nodes, edges, selectedId, criticalPath),
    [nodes, edges, selectedId, criticalPath],
  );

  useEffect(() => {
    setFlowNodes(layout.nodes);
    setFlowEdges(layout.edges);
  }, [layout, setFlowNodes, setFlowEdges]);

  useEffect(() => {
    if (!selectedId) return;
    window.requestAnimationFrame(() => {
      fitView({ nodes: [{ id: selectedId }], padding: 0.85, duration: 280 });
    });
  }, [fitView, selectedId]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.data as AgentNodeType);
    },
    [onNodeSelect],
  );

  const onPaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect]);
  const activeAgents = nodes.filter((node) => node.status === 'running').length;
  const recentAgents = nodes.filter(
    (node) => node.lastSeenAt && Date.now() - node.lastSeenAt < 15_000,
  ).length;

  return (
    <div className="relative h-full w-full bg-[#080b14]">
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="max-w-sm rounded-xl border border-dashed border-gray-800 bg-gray-950/85 px-5 py-4 text-center shadow-2xl shadow-black/25 backdrop-blur">
            <div className="text-sm font-semibold text-gray-200">No graph yet</div>
            <div className="mt-1 text-xs leading-5 text-gray-500">
              Agent nodes appear after the first session or tool event is written.
            </div>
          </div>
        </div>
      )}
      <div className="pointer-events-none absolute left-4 top-4 z-10 rounded-lg border border-gray-800/80 bg-gray-950/80 px-3 py-2 shadow-xl shadow-black/20 backdrop-blur">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">
          Agent Graph
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs">
          <span className="font-medium text-gray-300">{nodes.length} agents</span>
          <span className="text-gray-700">/</span>
          <span className="font-medium text-blue-300">{activeAgents} running</span>
          <span className="text-gray-700">/</span>
          <span className="font-medium text-emerald-300">{recentAgents} live</span>
          <span className="text-gray-700">/</span>
          <span className="font-medium text-gray-400">{edges.length} links</span>
          {selectedNode && (
            <>
              <span className="text-gray-700">/</span>
              <span className="font-medium text-emerald-300">focused</span>
            </>
          )}
          {criticalPath.durationMs > 0 && (
            <>
              <span className="text-gray-700">/</span>
              <span className="font-medium text-amber-300">
                critical {(criticalPath.durationMs / 1000).toFixed(1)}s
              </span>
            </>
          )}
        </div>
      </div>
      <ReactFlow
        className="agentflow-graph"
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25, minZoom: 0.55, maxZoom: 1.08 }}
        minZoom={0.25}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(37,99,235,0.10),transparent_34%),linear-gradient(180deg,rgba(15,23,42,0.55),transparent_26%)]" />
        <Background color="#1f2937" gap={28} size={1} />
      </ReactFlow>
    </div>
  );
}
