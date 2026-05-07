import { useMemo, useState } from 'react';
import { ReactFlowProvider } from 'reactflow';
import Header from './components/Header';
import AgentGraph from './components/AgentGraph';
import TraceEvidencePanel from './components/TraceEvidencePanel';
import TraceTimeline from './components/TraceTimeline';
import TraceTree from './components/TraceTree';
import { useRunTrace } from './hooks/useRunTrace';
import type { TraceNode } from './types';
import { computeCriticalPath } from './utils/criticalPath.js';

function durationLabel(startedAt?: number, completedAt?: number): string {
  if (!startedAt) return 'live trace';
  const end = completedAt || Date.now();
  return `${Math.max(0, Math.round((end - startedAt) / 1000))}s`;
}

export default function App() {
  const { run, traceNodes, timelineItems, graph, connected, error, snapshot } = useRunTrace();
  const [selectedNode, setSelectedNode] = useState<TraceNode | null>(null);
  const [showGraph, setShowGraph] = useState(false);

  const selectedId = selectedNode?.id || null;
  const criticalPath = useMemo(
    () => computeCriticalPath(graph.nodes, graph.edges, snapshot?.rawEvents || []),
    [graph.nodes, graph.edges, snapshot?.rawEvents],
  );

  const selectedGraphNode = useMemo(() => {
    if (!selectedNode?.agentInstanceId) return null;
    const agentName = selectedNode.agentInstanceId.split(':').slice(1).join(':');
    return graph.nodes.find((node) => node.id === agentName) || null;
  }, [graph.nodes, selectedNode]);

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
          <div className="flex h-10 items-center justify-between border-b border-gray-800 bg-[#0b1020] px-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Work Trace
            </div>
            <button
              type="button"
              onClick={() => setShowGraph((value) => !value)}
              className="rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-[10px] font-semibold text-gray-400 hover:text-gray-200"
            >
              {showGraph ? 'Tree' : 'Graph'}
            </button>
          </div>
          {showGraph ? (
            <ReactFlowProvider>
              <AgentGraph
                nodes={graph.nodes}
                edges={graph.edges}
                selectedNode={selectedGraphNode}
                criticalPath={criticalPath}
                onNodeSelect={() => {}}
              />
            </ReactFlowProvider>
          ) : (
            <TraceTree nodes={traceNodes} selectedId={selectedId} onSelect={setSelectedNode} />
          )}
        </main>
        <TraceEvidencePanel selectedNode={selectedNode} events={snapshot?.rawEvents || []} />
        <div className="col-span-2">
          <TraceTimeline
            items={timelineItems}
            selectedTraceNodeId={selectedId}
            onSelectTraceNode={(traceNodeId) => {
              const node = traceNodes.find((item) => item.id === traceNodeId);
              if (node) setSelectedNode(node);
            }}
          />
        </div>
      </div>
    </div>
  );
}
