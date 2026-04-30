import { Handle, Position, NodeProps } from 'reactflow';
import type { AgentStatus } from '../types';

export interface AgentNodeData {
  label: string;       // already includes icon prefix like "⬡ builder"
  status: AgentStatus;
  tasksCompleted?: number;
  tasksFailed?: number;
  startedAt?: number;
  completedAt?: number;
}

const statusConfig: Record<AgentStatus, { border: string; bg: string; glow: string; bar: string; label: string }> = {
  running:   { border: 'border-emerald-400', bg: 'from-emerald-400/10 to-emerald-400/5', glow: 'shadow-emerald-400/30 shadow-lg', bar: 'bg-emerald-400', label: 'Running' },
  completed: { border: 'border-gray-500',     bg: 'from-gray-700 to-gray-800',              glow: '',                                       bar: 'bg-gray-500',    label: 'Done' },
  error:     { border: 'border-red-400',      bg: 'from-red-400/10 to-red-400/5',            glow: 'shadow-red-400/30 shadow-lg',          bar: 'bg-red-400',     label: 'Error' },
  idle:      { border: 'border-blue-400',     bg: 'from-blue-400/10 to-blue-400/5',          glow: '',                                       bar: 'bg-blue-400',    label: 'Idle' },
};

export default function AgentFlowNode({ data }: NodeProps<AgentNodeData>) {
  const { label, status, tasksCompleted = 0, tasksFailed = 0, startedAt, completedAt } = data;
  const cfg = statusConfig[status] || statusConfig.idle;

  // Time progress bar
  let progress = 0;
  let elapsed = '';
  if (startedAt) {
    const end = completedAt || Date.now();
    const total = end - startedAt;
    elapsed = (total / 1000).toFixed(0) + 's';
    if (status === 'completed' && completedAt) {
      progress = 100;
    } else if (status === 'running') {
      progress = Math.min(95, Math.max(5, (total / 30000) * 100)); // scale to ~30s max
    }
  }

  const hasTasks = tasksCompleted > 0 || tasksFailed > 0;

  return (
    <div
      className={`
        relative px-3 py-2.5 rounded-xl border-2 min-w-[150px]
        transition-all duration-500 bg-gradient-to-br ${cfg.bg} ${cfg.border} text-white ${cfg.glow}
        ${status === 'running' ? 'animate-pulse' : ''}
        ${status === 'error' ? 'animate-[pulse_0.5s_ease-in-out_3]' : ''}
      `}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400 !w-3 !h-3" />

      {/* Header: icon + name */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="font-semibold text-sm truncate">{label}</span>
      </div>

      {/* Task counter */}
      {hasTasks && (
        <div className="flex items-center gap-1 text-[10px] mb-1">
          <span className="text-emerald-400 font-medium">{tasksCompleted}</span>
          {tasksFailed > 0 && <span className="text-red-400 font-medium ml-1">/ {tasksFailed}</span>}
          <span className="text-gray-500">tasks</span>
          {elapsed && <span className="text-gray-500 ml-auto">{elapsed}</span>}
        </div>
      )}

      {/* Time progress bar (only when running) */}
      {status === 'running' && startedAt && (
        <div className="w-full h-1 bg-gray-700 rounded-full overflow-hidden mb-1">
          <div
            className={`h-full rounded-full transition-all duration-1000 ${cfg.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Status label */}
      <div className="text-[10px] uppercase tracking-wider opacity-50">{cfg.label}</div>

      <Handle type="source" position={Position.Right} className="!bg-gray-400 !w-3 !h-3" />
    </div>
  );
}
