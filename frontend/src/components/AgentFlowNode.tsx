import { Handle, Position, NodeProps, NodeToolbar } from 'reactflow';
import type { AgentStatus } from '../types';

export interface AgentNodeData {
  label: string;
  status: AgentStatus;
  tasksCompleted?: number;
  tasksFailed?: number;
  startedAt?: number;
  completedAt?: number;
}

const statusConfig: Record<AgentStatus, { border: string; bg: string; glow: string; label: string }> = {
  running:   { border: 'border-emerald-400', bg: 'from-emerald-400/10 to-emerald-400/5', glow: 'shadow-emerald-400/30 shadow-lg', label: 'Running' },
  completed: { border: 'border-gray-500',     bg: 'from-gray-700 to-gray-800',              glow: '',                                       label: 'Done' },
  error:     { border: 'border-red-400',      bg: 'from-red-400/10 to-red-400/5',            glow: 'shadow-red-400/30 shadow-lg',          label: 'Error' },
  idle:      { border: 'border-blue-400',     bg: 'from-blue-400/10 to-blue-400/5',          glow: '',                                       label: 'Idle' },
};

export default function AgentFlowNode({ data }: NodeProps<AgentNodeData>) {
  const { label, status, tasksCompleted = 0, tasksFailed = 0, startedAt, completedAt } = data;
  const cfg = statusConfig[status] || statusConfig.idle;

  const elapsed = startedAt && completedAt ? ((completedAt - startedAt) / 1000).toFixed(1) + 's' : null;

  return (
    <>
      <NodeToolbar position={Position.Top}>
        <div className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap">
          <div className="font-semibold text-white mb-1 capitalize">{label}</div>
          <div className="space-y-0.5 text-gray-300">
            <div className="flex justify-between gap-4">
              <span>Tasks</span>
              <span className="text-emerald-400">{tasksCompleted}</span>
            </div>
            {tasksFailed > 0 && (
              <div className="flex justify-between gap-4">
                <span>Failed</span>
                <span className="text-red-400">{tasksFailed}</span>
              </div>
            )}
            {elapsed && (
              <div className="flex justify-between gap-4">
                <span>Time</span>
                <span>{elapsed}</span>
              </div>
            )}
            <div className="flex justify-between gap-4">
              <span>Status</span>
              <span className={`${status === 'running' ? 'text-emerald-400' : status === 'error' ? 'text-red-400' : 'text-gray-400'}`}>{cfg.label}</span>
            </div>
          </div>
        </div>
      </NodeToolbar>

      <div
        className={`
          relative px-4 py-3 rounded-xl border-2 min-w-[140px] text-center
          transition-all duration-500 bg-gradient-to-br ${cfg.bg} ${cfg.border} text-white ${cfg.glow}
          ${status === 'running' ? 'animate-pulse' : ''}
          ${status === 'error' ? 'animate-[pulse_0.5s_ease-in-out_3]' : ''}
        `}
      >
        <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-3 !h-3" />
        <div className="flex items-center justify-center mb-0.5">
          <span className="font-semibold text-sm capitalize">{label}</span>
        </div>
        <div className="text-[10px] uppercase tracking-wider opacity-50">{cfg.label}</div>
        <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-3 !h-3" />
      </div>
    </>
  );
}
