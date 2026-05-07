import type { TraceNode } from '../types';

const STATUS_CLASS: Record<string, string> = {
  pending: 'border-gray-700 bg-gray-900 text-gray-400',
  running: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  completed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  failed: 'border-red-500/40 bg-red-500/10 text-red-200',
  stale: 'border-gray-700 bg-gray-900 text-gray-500',
};

interface TraceTreeProps {
  nodes: TraceNode[];
  selectedId: string | null;
  onSelect: (node: TraceNode) => void;
}

export default function TraceTree({ nodes, selectedId, onSelect }: TraceTreeProps) {
  const rootNodes = nodes.filter((node) => !node.parentId);
  const childNodes = new Map<string, TraceNode[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    childNodes.set(node.parentId, [...(childNodes.get(node.parentId) || []), node]);
  }

  const renderNode = (node: TraceNode, depth: number) => (
    <div key={node.id}>
      <button
        type="button"
        onClick={() => onSelect(node)}
        className={`w-full border-b border-gray-800 px-4 py-3 text-left transition-colors hover:bg-gray-900/80 ${
          selectedId === node.id ? 'bg-blue-500/10' : 'bg-transparent'
        }`}
        style={{ paddingLeft: `${16 + depth * 18}px` }}
      >
        <div className="flex items-center gap-2">
          <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${STATUS_CLASS[node.status]}`}>
            {node.status}
          </span>
          <span className="truncate text-sm font-medium text-gray-100">{node.title}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-600">
          <span>{node.kind.replace('_', ' ')}</span>
          <span>{node.confidence}</span>
          <span>{node.sourceEventIds.length} evidence</span>
        </div>
      </button>
      {(childNodes.get(node.id) || []).map((child) => renderNode(child, depth + 1))}
    </div>
  );

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-600">
        Waiting for trace events
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-950/60">
      {rootNodes.map((node) => renderNode(node, 0))}
    </div>
  );
}
