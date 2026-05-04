import { useMemo } from 'react';
import type { AgentEvent } from '../types';

interface StatsBarProps {
  events: AgentEvent[];
  connected: boolean;
}

export default function StatsBar({ events, connected }: StatsBarProps) {
  const stats = useMemo(() => {
    const errors = events.filter(e => e.type === 'error').length;
    const first = events[0]?.timestamp || 0;
    const last = events[events.length - 1]?.timestamp || 0;
    const elapsed = last - first;
    const seconds = Math.floor(elapsed / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return { total: events.length, errors, elapsed: `${mins}m ${secs}s`, first };
  }, [events]);

  return (
    <div className="flex items-center gap-4 text-xs text-gray-400">
      <span>
        Events: <span className="text-gray-200 font-semibold">{stats.total}</span>
      </span>
      {stats.errors > 0 && (
        <span>
          Errors: <span className="text-red-400 font-semibold">{stats.errors}</span>
        </span>
      )}
      {events.length > 1 && (
        <span>
          Duration: <span className="text-gray-200">{stats.elapsed}</span>
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} />
        {connected ? 'live' : 'offline'}
      </span>
    </div>
  );
}
