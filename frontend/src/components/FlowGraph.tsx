import { useEffect } from 'react';
import ReactFlow, { Node, Edge, Background, Controls, Position, MarkerType, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import AgentFlowNode from './AgentFlowNode';
import TaskGroupNode, { getTaskColor } from './TaskGroupNode';
import type { AgentNodeData } from './AgentFlowNode';
import type { AgentEvent, AgentStatus, EventType } from '../types';

interface FlowGraphProps {
  events: AgentEvent[];
  selectedAgent?: string | null;
}

const nodeTypes = { agentFlow: AgentFlowNode, taskGroup: TaskGroupNode };

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return (h >>> 0) / 0xffffffff;
}

function deriveStatus(agentId: string, events: AgentEvent[]): AgentStatus {
  const agentEvents = events.filter(e => e.agent === agentId);
  if (agentEvents.length === 0) return 'idle';
  const last = agentEvents[agentEvents.length - 1];
  const m: Record<EventType, AgentStatus> = {
    start: 'running', complete: 'completed', error: 'error',
    dispatch: 'running', task: 'running', message: 'running',
  };
  return m[last.type] || 'idle';
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

/** Deduce an icon/emoji from agent name */
function agentIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('builder') || n.includes('primary') || n.includes('lead')) return '⬡';
  if (n.includes('product') || n.includes('pm')) return '📋';
  if (n.includes('tech') || n.includes('architect')) return '🏗';
  if (n.includes('backend') || n.includes('back')) return '⚙';
  if (n.includes('frontend') || n.includes('front')) return '🎨';
  if (n.includes('test') || n.includes('qa')) return '🧪';
  if (n.includes('db') || n.includes('data')) return '🗄';
  if (n.includes('devops') || n.includes('infra')) return '🚀';
  if (n.includes('security')) return '🔒';
  if (n.includes('review')) return '🔍';
  return '●';
}

interface DispatchWave { time: number; dispatcher: string; targets: string[]; }

function buildTimelineLayout(events: AgentEvent[]): { nodes: Node[]; edges: Edge[] } {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const allAgents = new Set<string>();
  const parentMap = new Map<string, string>();
  for (const event of sorted) {
    allAgents.add(event.agent);
    if (event.targetAgent) { allAgents.add(event.targetAgent); parentMap.set(event.targetAgent, event.agent); }
  }

  const roots = Array.from(allAgents).filter(a => !parentMap.has(a));
  const dispatchEvents = sorted.filter(e => e.targetAgent);
  const waves: DispatchWave[] = [];
  const PARALLEL_WINDOW = 2000;

  for (const event of dispatchEvents) {
    const last = waves[waves.length - 1];
    if (last && Math.abs(event.timestamp - last.time) <= PARALLEL_WINDOW && last.dispatcher === event.agent) {
      if (!last.targets.includes(event.targetAgent!)) last.targets.push(event.targetAgent!);
      last.time = event.timestamp;
    } else {
      waves.push({ time: event.timestamp, dispatcher: event.agent, targets: [event.targetAgent!] });
    }
  }

  const root = roots.length > 0 ? roots[0] : (dispatchEvents.length > 0 ? dispatchEvents[0].agent : null);

  // Build tasks
  const tasks: { id: number; waves: DispatchWave[] }[] = [];
  let currentWaves: DispatchWave[] = [];
  let taskId = 1;
  for (let i = 0; i < waves.length; i++) {
    const wave = waves[i];
    if (currentWaves.length > 0) {
      const prevTargets = new Set(currentWaves.flatMap(w => w.targets));
      const allPrevDone = [...prevTargets].every(a => deriveStatus(a, events) === 'completed');
      const isFromRoot = root != null && wave.dispatcher === root;
      if (allPrevDone && isFromRoot) { tasks.push({ id: taskId++, waves: currentWaves }); currentWaves = []; }
    }
    currentWaves.push(wave);
  }
  if (currentWaves.length > 0) tasks.push({ id: taskId, waves: currentWaves });

  const H_GAP = 340, V_GAP = 130, TASK_GAP = 100, TASK_PAD = 60;
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
    const targetRunning = deriveStatus(target, events) === 'running';
    edges.push({
      id: key,
      source, target,
      type: 'smoothstep',
      animated: !isReturn && targetRunning,
      label: `${isReturn ? '↩' : '↳'} #${order} ${time}`,
      labelStyle: { fill: '#9ca3af', fontSize: 9, fontWeight: 500 },
      labelBgStyle: { fill: '#1f2937', fillOpacity: 0.9 },
      style: {
        stroke: isReturn ? '#6b7280' : (targetRunning ? '#34d399' : '#6b7280'),
        strokeWidth: isReturn ? 1 : (targetRunning ? 2.5 : 1.5),
        strokeDasharray: isReturn ? '4,4' : (targetRunning ? 'none' : '5,5'),
      },
      markerEnd: {
        type: isReturn ? MarkerType.Arrow : MarkerType.ArrowClosed,
        width: isReturn ? 12 : 16, height: isReturn ? 12 : 16,
        color: isReturn ? '#6b7280' : (targetRunning ? '#34d399' : '#6b7280'),
      },
    });
  }

  const taskBounds: { xStart: number; xEnd: number; yMin: number; yMax: number; taskId: number }[] = [];

  for (let ti = 0; ti < tasks.length; ti++) {
    const task = tasks[ti];
    const taskFirstX = xOffset;

    const builderId = `builder:${task.id}`;
    const builderLabel = root || 'primary';
    const isLastTask = ti === tasks.length - 1;
    const builderStatus = isLastTask
      ? (task.waves.some(w => w.dispatcher === root) ? 'running' : deriveStatus(root || builderLabel, events))
      : 'completed';
    const icon = agentIcon(builderLabel);
    nodes.push({
      id: builderId, type: 'agentFlow',
      data: { ...deriveAgentData(root || builderLabel, events), label: `${icon} ${builderLabel}`, status: builderStatus },
      position: { x: xOffset, y: 0 },
      sourcePosition: Position.Right, targetPosition: Position.Left,
    });
    xOffset += H_GAP;

    if (ti > 0 && prevTaskTargets.length > 0) {
      for (const target of prevTaskTargets) {
        const wave = waves.find(w => w.targets.includes(target));
        addEdge(target, builderId, 'return', wave ? wave.time : Date.now());
      }
    }

    const allTargets: { scopedId: string; agentName: string }[] = [];
    for (const wave of task.waves) {
      const waveX = xOffset;
      for (const target of wave.targets) {
        const scopedId = `${target}:t${task.id}`;
        allTargets.push({ scopedId, agentName: target });
        if (!nodes.find(n => n.id === scopedId)) {
          const tIcon = agentIcon(target);
          nodes.push({
            id: scopedId, type: 'agentFlow',
            data: { ...deriveAgentData(target, events), label: `${tIcon} ${target}` },
            position: { x: waveX, y: 0 },
            sourcePosition: Position.Right, targetPosition: Position.Left,
          });
        }
        addEdge(builderId, scopedId, 'dispatch', wave.time);
      }
      xOffset += H_GAP;
    }
    prevTaskTargets = allTargets.map(t => t.scopedId);
    const taskLastX = xOffset - H_GAP;
    taskBounds.push({ xStart: taskFirstX, xEnd: taskLastX, yMin: 0, yMax: 0, taskId: task.id });
    xOffset += TASK_GAP;
  }

  // Position nodes vertically by column
  const cols = new Map<number, string[]>();
  for (const node of nodes) {
    if (node.type === 'taskGroup') continue;
    const xRounded = Math.round(node.position.x / 10) * 10;
    if (!cols.has(xRounded)) cols.set(xRounded, []);
    cols.get(xRounded)!.push(node.id);
  }
  const colYBounds = new Map<number, { min: number; max: number }>();
  for (const [, ids] of cols) {
    ids.sort((a, b) => hashStr(a) - hashStr(b));
    const totalH = ids.length * V_GAP;
    ids.forEach((id, i) => {
      const node = nodes.find(n => n.id === id);
      if (node) {
        const y = i * V_GAP - totalH / 2 + V_GAP / 2;
        node.position = { x: node.position.x, y };
      }
    });
    const top = -totalH / 2 + V_GAP / 2;
    const bottom = (ids.length - 1) * V_GAP - totalH / 2 + V_GAP / 2;
    // Get actual X for this column
    const colX = ids.length > 0 ? (nodes.find(n => n.id === ids[0])?.position.x || 0) : 0;
    colYBounds.set(Math.round(colX / 10) * 10, { min: top, max: bottom + V_GAP / 2 });
  }

  // Update task bounds with Y info and add group nodes
  for (const tb of taskBounds) {
    let yMin = Infinity, yMax = -Infinity;
    for (const [x, _ids] of cols) {
      if (x >= tb.xStart - 10 && x <= tb.xEnd + 10) {
        const bnds = colYBounds.get(x);
        if (bnds) { yMin = Math.min(yMin, bnds.min); yMax = Math.max(yMax, bnds.max); }
      }
    }
    if (!isFinite(yMin)) { yMin = -100; yMax = 100; }
    const w = tb.xEnd - tb.xStart + H_GAP + TASK_PAD;
    const h = yMax - yMin + TASK_PAD;
    nodes.push({
      id: `task-group-${tb.taskId}`,
      type: 'taskGroup',
      data: { label: `Task ${tb.taskId}`, color: getTaskColor(tb.taskId - 1) },
      position: { x: tb.xStart - TASK_PAD / 2, y: yMin - TASK_PAD / 2 },
      style: { width: w, height: h, backgroundColor: getTaskColor(tb.taskId - 1), borderRadius: 16, border: '1px solid rgba(107,114,128,0.15)' },
      zIndex: -1,
      draggable: false, selectable: false,
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
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView fitViewOptions={{ padding: 0.3 }}
      className="bg-gray-900"
    >
      <Background color="#374151" gap={20} />
      <Controls />
    </ReactFlow>
  );
}
