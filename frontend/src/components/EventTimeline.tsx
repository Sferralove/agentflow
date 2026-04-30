import type { AgentEvent } from '../types';

interface EventTimelineProps {
  events: AgentEvent[];
  onSelectAgent?: (agentId: string) => void;
}

const typeIcons: Record<string, string> = {
  start:    '▶',
  complete: '✓',
  dispatch: '→',
  error:    '✕',
  task:     '●',
  message:  '💬',
};

const typeColors: Record<string, string> = {
  start:    'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
  complete: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
  dispatch: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
  error:    'bg-red-400/20 text-red-300 border-red-400/30',
  task:     'bg-amber-400/20 text-amber-300 border-amber-400/30',
  message:  'bg-gray-400/20 text-gray-300 border-gray-400/30',
};

function relativeTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

/** Extract a short description from event payload */
function eventDescription(event: AgentEvent): string | null {
  const p = event.payload || {};
  if (typeof p.description === 'string' && p.description) return p.description;
  if (typeof p.action === 'string' && p.action) return p.action;
  if (typeof p.reason === 'string' && p.reason) return p.reason;
  if (typeof p.tokens === 'number' && p.tokens > 0) return `${p.tokens} tokens`;
  return null;
}

export default function EventTimeline({ events, onSelectAgent }: EventTimelineProps) {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Events</h2>
        <span className="text-xs text-gray-500">{events.length}</span>
      </div>
      <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
        {sorted.map((event) => (
          <div
            key={event.id}
            className="flex items-center gap-2 text-xs p-1.5 rounded hover:bg-gray-800/50 cursor-pointer group transition-colors"
            onClick={() => onSelectAgent?.(event.agent)}
          >
            <span className="text-gray-500 w-5 text-center shrink-0">{typeIcons[event.type] || '●'}</span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${typeColors[event.type] || typeColors.message}`}>
              {event.type}
            </span>
            <button className="font-medium text-gray-300 hover:text-white transition-colors truncate">
              {event.agent}
            </button>
            {event.targetAgent && (
              <>
                <span className="text-gray-600">→</span>
                <span className="text-gray-500 truncate">{event.targetAgent}</span>
              </>
            )}
            {eventDescription(event) && (
              <span className="text-gray-500 truncate hidden sm:inline italic">
                — {eventDescription(event)}
              </span>
            )}
            <span className="text-gray-600 ml-auto shrink-0 tabular-nums">{relativeTime(event.timestamp)}</span>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-center text-gray-600 text-xs py-4">No events yet</div>
        )}
      </div>
    </div>
  );
}
