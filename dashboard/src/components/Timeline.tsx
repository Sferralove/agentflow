import { useRef, useEffect } from 'react';
import type { AgentEvent } from '../types';
import EventRow from './EventRow';

export default function Timeline({ events }: { events: AgentEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const sorted = [...events].reverse(); // newest at top

  return (
    <div className="w-[320px] shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider
                      border-b border-gray-800 shrink-0">
        Timeline
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="p-4 text-xs text-gray-600 text-center">
            Waiting for events...
          </div>
        )}
        {sorted.map(event => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
