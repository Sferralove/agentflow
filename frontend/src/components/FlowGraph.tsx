import ReactFlow, { Node, Edge, Background, Controls, Position } from 'reactflow';
import 'reactflow/dist/style.css';
import type { AgentEvent } from '../types';

interface FlowGraphProps {
  events: AgentEvent[];
  selectedAgent?: string | null;
}

export default function FlowGraph({ events }: FlowGraphProps) {
  const { nodes, edges } = buildGraph(events);

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView className="bg-gray-900">
      <Background color="#374151" />
      <Controls />
    </ReactFlow>
  );
}

function buildGraph(events: AgentEvent[]): { nodes: Node[]; edges: Edge[] } {
  const agentSet = new Set<string>();
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  for (const event of events) {
    if (!agentSet.has(event.agent)) {
      agentSet.add(event.agent);
      nodes.push({
        id: event.agent,
        data: { label: event.agent },
        position: { x: Math.random() * 500, y: Math.random() * 500 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    }
    if (event.targetAgent && !agentSet.has(event.targetAgent)) {
      agentSet.add(event.targetAgent);
      nodes.push({
        id: event.targetAgent,
        data: { label: event.targetAgent },
        position: { x: Math.random() * 500, y: Math.random() * 500 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
      });
    }
    if (event.targetAgent) {
      edges.push({
        id: `${event.agent}-${event.targetAgent}-${event.id}`,
        source: event.agent,
        target: event.targetAgent,
        label: event.type,
      });
    }
  }

  return { nodes, edges };
}
