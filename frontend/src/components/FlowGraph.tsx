import { useEffect } from 'react';
import ReactFlow, { Node, Edge, Background, Controls, Position, MarkerType, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import AgentFlowNode from './AgentFlowNode';
import type { AgentNodeData } from './AgentFlowNode';
import type { AgentEvent, AgentStatus, EventType } from '../types';

interface FlowGraphProps {
  events: AgentEvent[];
  selectedAgent?: string | null;
}

const nodeTypes = { agentFlow: AgentFlowNode };

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0) / 0xffffffff;
}

function deriveStatus(agentId: string, events: AgentEvent[]): AgentStatus {
  const agentEvents = events.filter(e => e.agent === agentId);
  if (agentEvents.length === 0) return 'idle';
  const last = agentEvents[agentEvents.length - 1];
  const typeMap: Record<EventType, AgentStatus> = {
    start: 'running', complete: 'completed', error: 'error',
    dispatch: 'running', task: 'running', message: 'running',
  };
  return typeMap[last.type] || 'idle';
}

function deriveAgentData(agentId: string, events: AgentEvent[]): AgentNodeData {
  const agentEvents = events.filter(e => e.agent === agentId);
  const status = deriveStatus(agentId, events);
  let tasksCompleted = 0, tasksFailed = 0;
  let startedAt: number | undefined, completedAt: number | undefined;
  for (const e of agentEvents) {
    if (e.type === 'start' && !startedAt) startedAt = e.timestamp;
    if (e.type === 'complete') { tasksCompleted++; completedAt = e.timestamp; }
    if (e.type === 'error') tasksFailed++;
  }
  return { label: agentId, status, tasksCompleted, tasksFailed, startedAt, completedAt };
}

interface DispatchWave {
  time: number;
  dispatcher: string;      // who dispatched
  targets: string[];       // who was dispatched
}

/** Group dispatches into waves, then into tasks */
function buildTimelineLayout(events: AgentEvent[]): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const allAgents = new Set<string>();
  const parentMap = new Map<string, string>();

  for (const event of sorted) {
    allAgents.add(event.agent);
    if (event.targetAgent) {
      allAgents.add(event.targetAgent);
      parentMap.set(event.targetAgent, event.agent);
    }
  }

  const roots = Array.from(allAgents).filter(a => !parentMap.has(a));

  // Build dispatch waves (time-grouped)
  const PARALLEL_WINDOW = 2000;
  const dispatchEvents = sorted.filter(e => e.targetAgent);
  const waves: DispatchWave[] = [];

  for (const event of dispatchEvents) {
    const last = waves[waves.length - 1];
    if (last && Math.abs(event.timestamp - last.time) <= PARALLEL_WINDOW && last.dispatcher === event.agent) {
      if (!last.targets.includes(event.targetAgent!)) {
        last.targets.push(event.targetAgent!);
      }
      last.time = event.timestamp;
    } else {
      waves.push({ time: event.timestamp, dispatcher: event.agent, targets: [event.targetAgent!] });
    }
  }

  // Detect root (primary orchestrator) — natural root or first dispatcher
  const root = roots.length > 0 ? roots[0] : (dispatchEvents.length > 0 ? dispatchEvents[0].agent : null);

  // Divide waves into tasks
  // Task boundary: when ALL targets from previous waves have completed AND new wave starts from root
  interface Task {
    id: number;
    waves: DispatchWave[];
  }

  const tasks: Task[] = [];
  let currentWaves: DispatchWave[] = [];
  let taskId = 1;

  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];

    // Check if previous task's targets are all done
    if (currentWaves.length > 0) {
      const prevTargets = new Set<string>();
      for (const pw of currentWaves) {
        for (const t of pw.targets) prevTargets.add(t);
      }
      const allPrevDone = Array.from(prevTargets).every(a => deriveStatus(a, events) === 'completed');
      const isFromRoot = root && wave.dispatcher === root;

      if (allPrevDone && isFromRoot && currentWaves.length > 0) {
        tasks.push({ id: taskId++, waves: currentWaves });
        currentWaves = [];
      }
    }
    currentWaves.push(wave);
  }
  if (currentWaves.length > 0) {
    tasks.push({ id: taskId, waves: currentWaves });
  }

  // Build nodes: each task gets a Builder + its subagents
  const H_GAP = 340;
  const V_GAP = 130;
  const TASK_GAP = 80;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  let xOffset = 0;
  let prevTaskTargets: string[] = [];
  let edgeOrder = 0;
  const edgeAdded = new Set<string>();

  function addEdge(source: string, target: string, type: 'dispatch' | 'return', timestamp: number) {
    const key = `${source}→${target}:${type}`;
    if (edgeAdded.has(key)) return;
    edgeAdded.add(key);
    const order = ++edgeOrder;
    const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const isReturn = type === 'return';
    edges.push({
      id: key,
      source,
      target,
      type: 'smoothstep',
      animated: !isReturn && deriveStatus(target, events) === 'running',
      label: `${isReturn ? '↩' : '↳'} #${order} ${time}`,
      labelStyle: { fill: isReturn ? '#9ca3af' : '#6ee7b7', fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: '#1f2937', fillOpacity: 0.9 },
      style: {
        stroke: isReturn ? '#6b7280' : (deriveStatus(target, events) === 'running' ? '#34d399' : '#6b7280'),
        strokeWidth: isReturn ? 1 : (deriveStatus(target, events) === 'running' ? 2.5 : 1.5),
        strokeDasharray: isReturn ? '4,4' : (deriveStatus(target, events) === 'running' ? 'none' : '5,5'),
      },
      markerEnd: {
        type: isReturn ? MarkerType.Arrow : MarkerType.ArrowClosed,
        color: isReturn ? '#6b7280' : (deriveStatus(target, events) === 'running' ? '#34d399' : '#6b7280'),
      },
    });
  }

  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti];

    // Builder node for this task
    const builderId = `builder:${task.id}`;
    const builderLabel = root ? root : 'builder';
    const isLastTask = ti === tasks.length - 1;
    const builderStatus = isLastTask
      ? (task.waves.some(w => w.dispatcher === root) ? 'running' : deriveStatus(root || builderLabel, events))
      : 'completed';
    nodes.push({
      id: builderId,
      type: 'agentFlow',
      data: {
        label: builderLabel,
        status: builderStatus,
        tasksCompleted: ti,
        tasksFailed: 0,
      },
      position: { x: xOffset, y: 0 },
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    });
    xOffset += H_GAP;

    // Connections from previous task's targets to this Builder
    if (ti > 0 && prevTaskTargets.length > 0) {
      for (const target of prevTaskTargets) {
        const wave = waves.find(w => w.targets.includes(target));
        const time = wave ? wave.time : Date.now();
        addEdge(target, builderId, 'return', time);
      }
    }

    // Subagent nodes and dispatch edges for this task
    // Each agent gets a unique node per task (id = name:t{taskId})
    const allTargets: { scopedId: string; agentName: string }[] = [];
    for (const wave of task.waves) {
      const waveX = xOffset;
      for (const target of wave.targets) {
        const scopedId = `${target}:t${task.id}`;
        allTargets.push({ scopedId, agentName: target });
        if (!nodes.find(n => n.id === scopedId)) {
          nodes.push({
            id: scopedId,
            type: 'agentFlow',
            data: deriveAgentData(target, events),
            position: { x: waveX, y: 0 },
            sourcePosition: Position.Right,
            targetPosition: Position.Left,
          });
        }
        // Dispatch edge: builder → scoped node
        addEdge(builderId, scopedId, 'dispatch', wave.time);
      }
      xOffset += H_GAP;
    }
    prevTaskTargets = allTargets.map(t => t.scopedId);
    xOffset += TASK_GAP;
  }

  // Position nodes vertically: group by X position, spread vertically
  const cols = new Map<number, string[]>();
  for (const node of nodes) {
    const xRounded = Math.round(node.position.x / 10) * 10; // group by approximate X
    const existing = Array.from(cols.entries()).find(([, ids]) => ids.includes(node.id));
    if (!existing) {
      if (!cols.has(xRounded)) cols.set(xRounded, []);
      cols.get(xRounded)!.push(node.id);
    }
  }

  // Reassign Y within each column
  for (const [/* x */, ids] of cols) {
    ids.sort((a, b) => hashStr(a) - hashStr(b));
    const totalH = ids.length * V_GAP;
    ids.forEach((id, i) => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        node.position = { x: node.position.x, y: i * V_GAP - totalH / 2 + V_GAP / 2 };
      }
    });
  }

  return { nodes, edges };
}

export default function FlowGraph({ events }: FlowGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildTimelineLayout(events);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [events, setNodes, setEdges]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      className="bg-gray-900"
    >
      <Background color="#374151" gap={20} />
      <Controls />
    </ReactFlow>
  );
}
