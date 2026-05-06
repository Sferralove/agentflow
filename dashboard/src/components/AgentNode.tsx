import { memo } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import type { AgentNode as AgentNodeType } from '../types';
import { STATUS_COLORS } from '../types';

type AgentNodeData = AgentNodeType & {
  isDimmed?: boolean;
  isFocusPath?: boolean;
  isCriticalPath?: boolean;
  isRecentlyActive?: boolean;
};

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return 'no activity';
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

const AgentNodeComponent = ({ data, selected }: NodeProps<AgentNodeData>) => {
  const color = STATUS_COLORS[data.status];
  const totalTasks = data.tasksCompleted + data.tasksFailed;
  const completion = totalTasks > 0 ? (data.tasksCompleted / totalTasks) * 100 : 0;
  const typeLabel = data.type === 'main' ? 'MAIN' : 'SUB';
  const statusLabel = data.status.toUpperCase();
  const failed = data.tasksFailed > 0;
  const active = data.status === 'running' || data.isRecentlyActive;

  return (
    <div
      className={`relative w-64 overflow-hidden rounded-xl border bg-[#0b1020]/95 text-left text-white shadow-xl shadow-black/25 transition-all duration-200 hover:-translate-y-0.5 hover:border-gray-500 ${
        selected ? 'scale-[1.02] ring-2 ring-offset-2 ring-offset-[#080b14]' : ''
      } ${
        data.isDimmed ? 'opacity-35 grayscale' : 'opacity-100'
      }`}
      style={{
        borderColor: color,
        boxShadow: selected
          ? `0 0 0 1px ${color}, 0 0 36px ${color}33, 0 24px 60px rgb(0 0 0 / 0.45)`
          : data.isFocusPath
            ? `0 18px 45px rgb(0 0 0 / 0.32)`
            : undefined,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5"
        style={{ backgroundColor: data.isCriticalPath ? '#f59e0b' : color }}
      />
      <Handle
        type="target"
        position={Position.Top}
        className="!top-0 !h-2.5 !w-2.5 !border-2 !border-[#080b14]"
        style={{ backgroundColor: color }}
      />
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {active && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40"
                  style={{ backgroundColor: color }}
                />
              )}
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: color }}
              />
            </span>
            <div className="truncate text-sm font-semibold leading-5" title={data.name}>
              {data.name}
            </div>
          </div>
          <div className="mt-1 truncate font-mono text-[10px] text-gray-500" title={data.sessionId}>
            {data.sessionId}
          </div>
          {data.isCriticalPath && (
            <div className="mt-1 w-fit rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200">
              Critical path
            </div>
          )}
        </div>
        <div className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${
          data.isCriticalPath
            ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
            : 'border-gray-700/90 bg-gray-950/90 text-gray-300'
        }`}>
          {typeLabel}
        </div>
      </div>

      <div className="border-t border-gray-800/80 bg-gray-950/35 px-4 py-2.5">
        <div className="flex items-center justify-between gap-3 text-[11px]">
          <span className="font-semibold" style={{ color }}>
            {statusLabel}
          </span>
          <span className={`font-mono ${failed ? 'text-red-300' : 'text-gray-500'}`}>
            {totalTasks > 0
              ? `${data.tasksCompleted}/${totalTasks} tasks`
              : 'no tasks'}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px]">
          <span className="text-gray-600">Last activity</span>
          <span className={active ? 'text-emerald-300' : 'text-gray-500'}>
            {formatRelativeTime(data.lastSeenAt)}
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-800">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${completion}%`, backgroundColor: color }}
          />
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!bottom-0 !h-2.5 !w-2.5 !border-2 !border-[#080b14]"
        style={{ backgroundColor: color }}
      />
    </div>
  );
};

export default memo(AgentNodeComponent);
