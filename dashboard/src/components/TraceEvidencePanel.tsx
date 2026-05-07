import type { AgentEvent, TraceNode } from '../types';

interface TraceEvidencePanelProps {
  selectedNode: TraceNode | null;
  events: AgentEvent[];
}

export default function TraceEvidencePanel({ selectedNode, events }: TraceEvidencePanelProps) {
  const evidence = selectedNode
    ? events.filter((event) => selectedNode.sourceEventIds.includes(event.id))
    : [];

  if (!selectedNode) {
    return (
      <aside className="h-full border-l border-gray-800 bg-gray-950/80 px-4 py-4 text-xs text-gray-600">
        Select a trace step to inspect evidence.
      </aside>
    );
  }

  return (
    <aside className="h-full overflow-y-auto border-l border-gray-800 bg-gray-950/80">
      <div className="border-b border-gray-800 px-4 py-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-600">Evidence</div>
        <div className="mt-1 text-sm font-semibold text-gray-100">{selectedNode.title}</div>
        <div className="mt-1 text-[11px] text-gray-500">
          {selectedNode.kind} · {selectedNode.status} · {selectedNode.confidence}
        </div>
      </div>
      <div className="divide-y divide-gray-800">
        {evidence.map((event) => (
          <div key={event.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-gray-200">{event.tool || event.type}</span>
              <span className="font-mono text-[10px] text-gray-600">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
            </div>
            {event.input && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-gray-800 bg-gray-950 px-2 py-2 text-[10px] text-gray-500">
                {JSON.stringify(event.input, null, 2)}
              </pre>
            )}
            {typeof event.output === 'string' && event.output && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-gray-800 bg-gray-950 px-2 py-2 text-[10px] text-gray-400">
                {event.output}
              </pre>
            )}
            {event.error && (
              <pre className="mt-2 max-h-32 overflow-auto rounded-md border border-red-500/30 bg-red-950/30 px-2 py-2 text-[10px] text-red-200">
                {event.error}
              </pre>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
