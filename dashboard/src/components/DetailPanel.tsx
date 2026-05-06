import type { AgentNode, AgentEvent } from '../types';
import type { TimelineFilter } from '../utils/timeline.js';
import { STATUS_COLORS } from '../types';
import EventRow from './EventRow';

const TIMELINE_FILTERS: Array<{ id: TimelineFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'errors', label: 'Errors' },
  { id: 'bash', label: 'Bash' },
  { id: 'files', label: 'Files' },
  { id: 'tasks', label: 'Tasks' },
];

interface DetailPanelProps {
  selectedNode: AgentNode | null;
  events: AgentEvent[];
  criticalPathAgentIds?: Set<string>;
  timelineFilter: TimelineFilter;
  onTimelineFilterChange: (filter: TimelineFilter) => void;
  scopedAgentCount?: number;
  unified?: boolean;
}

function TimelineFilters({
  value,
  onChange,
}: {
  value: TimelineFilter;
  onChange: (filter: TimelineFilter) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {TIMELINE_FILTERS.map((filter) => (
        <button
          key={filter.id}
          type="button"
          onClick={() => onChange(filter.id)}
          className={`rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
            value === filter.id
              ? 'border-blue-400/40 bg-blue-400/15 text-blue-200'
              : 'border-gray-800 bg-gray-950/70 text-gray-500 hover:border-gray-700 hover:text-gray-300'
          }`}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

export default function DetailPanel({
  selectedNode,
  events,
  criticalPathAgentIds,
  timelineFilter,
  onTimelineFilterChange,
  scopedAgentCount,
  unified,
}: DetailPanelProps) {
  const started = events.filter((event) => event.type === 'tool.start').length;
  const completed = events.filter(
    (event) => event.type === 'tool.end' && !event.error,
  ).length;
  const failed = events.filter((event) => Boolean(event.error)).length;
  const running = Math.max(0, started - completed - failed);

  if (!selectedNode) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 border-b border-gray-800/80 bg-[#0b1020] px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {unified ? 'Timeline · all sessions' : 'Timeline'}
              </div>
              <div className="mt-1 text-sm font-medium text-gray-200">
                {events.length} events
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-semibold">
              <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-300">
                {running} running
              </span>
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">
                {completed} done
              </span>
              {failed > 0 && (
                <span className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-300">
                  {failed} failed
                </span>
              )}
            </div>
          </div>
          <TimelineFilters
            value={timelineFilter}
            onChange={onTimelineFilterChange}
          />
        </div>
        <div className="flex-1 overflow-y-auto bg-gray-950/50">
          {events.length === 0 ? (
            <div className="mx-4 mt-10 rounded-lg border border-dashed border-gray-800 px-4 py-8 text-center text-xs text-gray-600">
              {unified
                ? 'Start OpenCode to see events'
                : 'Click an agent node to inspect'}
            </div>
          ) : (
            events.map((evt) => (
              <EventRow
                key={evt.id}
                event={evt}
                showSession={unified}
                critical={criticalPathAgentIds?.has(evt.agent)}
              />
            ))
          )}
        </div>
      </div>
    );
  }

  const duration = selectedNode.completedAt
    ? ((selectedNode.completedAt - selectedNode.startedAt) / 1000).toFixed(0) +
      's'
    : selectedNode.status === 'error'
      ? 'error'
      : 'running...';
  const totalTasks = selectedNode.tasksCompleted + selectedNode.tasksFailed;
  const taskCompletion =
    totalTasks > 0 ? (selectedNode.tasksCompleted / totalTasks) * 100 : 0;

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 border-b border-gray-800/80 bg-[#0b1020] px-4 py-4">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: STATUS_COLORS[selectedNode.status] }}
          />
          <h3 className="truncate font-semibold text-sm">{selectedNode.name}</h3>
          <span className="ml-auto rounded-md border border-gray-700 bg-gray-950 px-2 py-1 text-[10px] font-semibold uppercase text-gray-400">
            {selectedNode.type}
          </span>
        </div>
        <div className="mt-1 truncate font-mono text-[10px] text-gray-600">
          {selectedNode.sessionId}
        </div>
        <div className="text-[11px] text-gray-500 mt-1">
          {selectedNode.status} · {duration}
          {scopedAgentCount && scopedAgentCount > 1 && (
            <span> · path scope {scopedAgentCount} agents</span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/70 p-3 shadow-inner shadow-black/20">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-sm font-semibold text-gray-200">{running}</div>
              <div className="mt-0.5 text-[10px] uppercase text-gray-600">
                Running
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-emerald-300">
                {selectedNode.tasksCompleted}
              </div>
              <div className="mt-0.5 text-[10px] uppercase text-gray-600">
                Done
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-red-300">
                {selectedNode.tasksFailed}
              </div>
              <div className="mt-0.5 text-[10px] uppercase text-gray-600">
                Failed
              </div>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-emerald-400 transition-all duration-300"
              style={{ width: `${taskCompletion}%` }}
            />
          </div>
          <div className="mt-1.5 text-right font-mono text-[10px] text-gray-600">
            {totalTasks > 0
              ? `${selectedNode.tasksCompleted}/${totalTasks} tasks`
              : 'no completed tasks'}
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-950/50">
        <div className="sticky top-0 z-10 border-b border-gray-800/70 bg-gray-950/95 px-4 py-2 backdrop-blur">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
            Path timeline · {events.length}
            {criticalPathAgentIds?.has(selectedNode.id) && (
              <span className="ml-2 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] text-amber-200">
                Critical path
              </span>
            )}
          </div>
          <TimelineFilters
            value={timelineFilter}
            onChange={onTimelineFilterChange}
          />
        </div>
        {events.length === 0 ? (
          <div className="mx-4 mt-8 rounded-lg border border-dashed border-gray-800 px-4 py-6 text-center text-xs text-gray-600">
            No events for this agent
          </div>
        ) : (
          events.map((evt) => (
            <EventRow
              key={evt.id}
              event={evt}
              critical={criticalPathAgentIds?.has(evt.agent)}
            />
          ))
        )}
      </div>
    </div>
  );
}
