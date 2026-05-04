import { memo } from 'react';
import { Handle, Position, type Node } from '@xyflow/react';

interface AgentNodeData extends Record<string, unknown> {
  label: string;
  eventCount: number;
  errorCount: number;
  isActive: boolean;
}

function AgentNodeComponent({ data }: { data: AgentNodeData }) {
  const nodeData = data;
  return (
    <div className={`
      px-3 py-2 rounded-lg border-2 shadow-lg text-xs font-mono
      transition-all duration-300 min-w-[100px] text-center
      ${nodeData.isActive
        ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300 shadow-emerald-500/20'
        : 'border-gray-700 bg-gray-900 text-gray-300'
      }
    `}>
      <Handle type="target" position={Position.Top} className="!bg-gray-600" />
      <div className="font-bold text-sm">{nodeData.label}</div>
      <div className="flex justify-center gap-2 mt-1">
        <span className="text-gray-500">{nodeData.eventCount} events</span>
        {nodeData.errorCount > 0 && (
          <span className="text-red-400">{nodeData.errorCount} err</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
    </div>
  );
}

export default memo(AgentNodeComponent);
