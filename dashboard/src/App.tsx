import { useMemo, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import Header from './components/Header';
import AgentGraph from './components/AgentGraph';
import TraceEvidencePanel from './components/TraceEvidencePanel';
import TraceTimeline from './components/TraceTimeline';
import { useRunTrace } from './hooks/useRunTrace';
import type { AgentNode as AgentNodeType, TraceNode } from './types';
import { computeCriticalPath } from './utils/criticalPath.js';

function durationLabel(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return 'live trace';
  const end = completedAt || Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 1000))}s`;
}

function agentToTraceNode(agent: AgentNodeType | null, events: any[], runId: string): TraceNode | null {
  if (!agent) return null;
  const agentEvents = events.filter(e => e.agent === agent.id);
  const statusMap: Record<string, TraceNode['status']> = {
    idle: 'pending',
    running: 'running',
    completed: 'completed',
    error: 'failed',
    compacted: 'stale',
  };
  return {
    id: `agent_${agent.id}`,
    runId,
    kind: 'agent_work',
    title: agent.name,
    status: statusMap[agent.status] || 'pending',
    sourceEventIds: agentEvents.map(e => e.id),
    confidence: 'observed' as const,
  };
}

const VISIBLE_TIMELINE_KINDS = new Set([
  'tool.completed',
  'delegation.started',
  'delegation.completed',
  'command.executed',
  'file.changed',
  'error.detected',
]);

export default function App() {
  const { run, traceNodes, timelineItems, graph, connected, error, snapshot } = useRunTrace();
  const [selectedAgent, setSelectedAgent] = useState<AgentNodeType | null>(null);

  const rawEvents = snapshot?.rawEvents || [];
  const runId = run?.id || '';

  const criticalPath = useMemo(
    () => computeCriticalPath(graph.nodes, graph.edges, rawEvents),
    [graph.nodes, graph.edges, rawEvents],
  );

  const selectedTraceNode = useMemo(
    () => agentToTraceNode(selectedAgent, rawEvents, runId),
    [selectedAgent, rawEvents, runId],
  );

  const selectedTraceNodeId = selectedTraceNode?.id || null;

  const filteredTimeline = useMemo(
    () => timelineItems.filter(item => VISIBLE_TIMELINE_KINDS.has(item.kind)),
    [timelineItems],
  );

  const handleTimelineSelect = (traceNodeId: string) => {
    const node = traceNodes.find(n => n.id === traceNodeId);
    if (node?.agentInstanceId) {
      const agentName = node.agentInstanceId.split(':').slice(1).join(':');
      const agentNode = graph.nodes.find(n => n.id === agentName);
      if (agentNode) setSelectedAgent(agentNode);
    }
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#070a12] text-gray-100">
      <Header
        connected={connected}
        runTitle={run?.title || 'Current Run'}
        runStatus={run?.status || 'waiting'}
        durationLabel={durationLabel(run?.startedAt, run?.completedAt)}
      />
      {error && (
        <div className="absolute right-4 top-16 z-30 rounded-lg border border-red-500/30 bg-red-950/50 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(24rem,1fr)_24rem] grid-rows-[minmax(0,1fr)_auto] overflow-hidden">
        <main className="min-h-0 overflow-hidden border-r border-gray-800">
          <div className="flex h-10 items-center border-b border-gray-800 bg-[#0b1020] px-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Agent Graph
            </div>
          </div>
          <ReactFlowProvider>
            <AgentGraph
              nodes={graph.nodes}
              edges={graph.edges}
              selectedNode={selectedAgent}
              criticalPath={criticalPath}
              onNodeSelect={setSelectedAgent}
            />
          </ReactFlowProvider>
        </main>
        <TraceEvidencePanel selectedNode={selectedTraceNode} events={rawEvents} />
        <div className="col-span-2">
          <TraceTimeline
            items={filteredTimeline}
            selectedTraceNodeId={selectedTraceNodeId}
            onSelectTraceNode={handleTimelineSelect}
          />
        </div>
      </div>
    </div>
  );
}
