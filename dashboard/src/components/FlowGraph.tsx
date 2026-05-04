import { useState, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AgentEvent } from '../types';
import AgentNode from './AgentNode';

const nodeTypes = { agentNode: AgentNode };
const INITIAL_GRAPH = { nodes: [] as Node[], edges: [] as Edge[] };

function buildGraph(events: AgentEvent[]): { nodes: Node[]; edges: Edge[] } {
  const agentCounts = new Map<string, { total: number; errors: number; lastTs: number }>();
  const dispatchEdges = new Map<string, { source: string; target: string; count: number }>();

  for (const event of events) {
    // Count per agent
    const stats = agentCounts.get(event.agent) || { total: 0, errors: 0, lastTs: 0 };
    stats.total++;
    if (event.type === 'error') stats.errors++;
    if (event.timestamp > stats.lastTs) stats.lastTs = event.timestamp;
    agentCounts.set(event.agent, stats);

    // Build dispatch edges
    if (event.type === 'dispatch' && event.targetAgent) {
      const key = `${event.agent}->${event.targetAgent}`;
      const existing = dispatchEdges.get(key);
      if (existing) {
        existing.count++;
      } else {
        dispatchEdges.set(key, { source: event.agent, target: event.targetAgent, count: 1 });
      }
    }
  }

  // Layout nodes in a grid
  const agents = Array.from(agentCounts.entries());
  const now = Date.now();
  const cols = Math.ceil(Math.sqrt(agents.length));
  const nodes: Node[] = agents.map(([agent, stats], i) => ({
    id: agent,
    type: 'agentNode',
    position: {
      x: (i % cols) * 180 + 50,
      y: Math.floor(i / cols) * 100 + 50,
    },
    data: {
      label: agent,
      eventCount: stats.total,
      errorCount: stats.errors,
      isActive: (now - stats.lastTs) < 5000, // active in last 5s
    },
  }));

  // Build edges
  const edges: Edge[] = Array.from(dispatchEdges.values()).map((e, i) => ({
    id: `e${i}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: '#a855f7', strokeWidth: 1 + e.count },
    label: `${e.count} dispatch${e.count > 1 ? 'es' : ''}`,
    labelStyle: { fill: '#a855f7', fontSize: 10 },
  }));

  return { nodes, edges };
}

/**
 * Debounced graph builder — limits rebuilds to prevent jank at high event rates.
 * Rebuilds immediately if >800ms since last rebuild, otherwise waits 300ms of silence.
 */
function useDebouncedGraph(events: AgentEvent[]) {
  const [graph, setGraph] = useState(INITIAL_GRAPH);
  const lastRebuild = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const now = Date.now();
    const since = now - lastRebuild.current;

    clearTimeout(timer.current);

    if (since > 800) {
      // Fast path: enough time since last rebuild, rebuild now
      setGraph(buildGraph(events));
      lastRebuild.current = now;
    } else {
      // Slow path: debounce — wait for quiet period
      timer.current = setTimeout(() => {
        setGraph(buildGraph(events));
        lastRebuild.current = Date.now();
      }, 300);
    }

    return () => clearTimeout(timer.current);
  }, [events]);

  return graph;
}

export default function FlowGraph({ events }: { events: AgentEvent[] }) {
  const graph = useDebouncedGraph(events);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider
                      border-b border-gray-800 shrink-0">
        Flow Graph
      </div>
      <div className="flex-1">
        <ReactFlow
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="bg-gray-950"
        >
          <Background color="#1f2937" gap={20} />
          <Controls className="!bg-gray-900 !border-gray-700 !text-gray-300" />
          <MiniMap
            nodeColor={(n) => (n.data as any)?.isActive ? '#10b981' : '#374151'}
            maskColor="rgba(0,0,0,0.7)"
            className="!bg-gray-900 !border-gray-700"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
