import type { AgentEvent } from '../types';

interface EventTimelineProps {
  events: AgentEvent[];
}

export default function EventTimeline({ events }: EventTimelineProps) {
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-2">Event Timeline</h2>
      <div className="space-y-1">
        {sorted.map((event) => (
          <div key={event.id} className="flex items-center gap-2 text-sm p-2 rounded hover:bg-gray-800">
            <span className="text-gray-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
            <span className={`px-2 py-0.5 rounded text-xs ${getTypeColor(event.type)}`}>{event.type}</span>
            <span className="font-medium">{event.agent}</span>
            {event.targetAgent && <span className="text-gray-400">→ {event.targetAgent}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'start': return 'bg-green-900 text-green-300';
    case 'complete': return 'bg-blue-900 text-blue-300';
    case 'dispatch': return 'bg-purple-900 text-purple-300';
    case 'error': return 'bg-red-900 text-red-300';
    case 'task': return 'bg-yellow-900 text-yellow-300';
    default: return 'bg-gray-700 text-gray-300';
  }
}
