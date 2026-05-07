import type { TimelineItem } from '../types';

interface TraceTimelineProps {
  items: TimelineItem[];
  selectedTraceNodeId: string | null;
  onSelectTraceNode: (traceNodeId: string) => void;
}

export default function TraceTimeline({ items, selectedTraceNodeId, onSelectTraceNode }: TraceTimelineProps) {
  return (
    <div className="h-44 overflow-y-auto border-t border-gray-800 bg-gray-950">
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center text-xs text-gray-600">
          Timeline appears as events arrive.
        </div>
      ) : (
        items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => item.traceNodeId && onSelectTraceNode(item.traceNodeId)}
            className={`grid w-full grid-cols-[5.5rem_8rem_minmax(0,1fr)] gap-3 border-b border-gray-800 px-4 py-2 text-left text-xs hover:bg-gray-900/70 ${
              selectedTraceNodeId === item.traceNodeId ? 'bg-blue-500/10' : ''
            }`}
          >
            <span className="font-mono text-[10px] text-gray-600">
              {new Date(item.timestamp).toLocaleTimeString()}
            </span>
            <span className="truncate text-[10px] uppercase text-gray-500">{item.kind}</span>
            <span className="truncate text-gray-300">{item.title}</span>
          </button>
        ))
      )}
    </div>
  );
}
