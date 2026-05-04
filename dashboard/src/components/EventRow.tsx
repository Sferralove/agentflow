import type { AgentEvent } from '../types';

const TYPE_COLORS: Record<string, string> = {
  start: 'border-emerald-500 text-emerald-400',
  complete: 'border-blue-500 text-blue-400',
  dispatch: 'border-purple-500 text-purple-400',
  task: 'border-yellow-500 text-yellow-400',
  error: 'border-red-500 text-red-400',
  message: 'border-gray-500 text-gray-400',
};

const TYPE_ICONS: Record<string, string> = {
  start: '▶',
  complete: '✓',
  dispatch: '↗',
  task: '●',
  error: '✕',
  message: '💬',
};

export default function EventRow({ event }: { event: AgentEvent }) {
  const color = TYPE_COLORS[event.type] || 'border-gray-600 text-gray-500';
  const icon = TYPE_ICONS[event.type] || '·';
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const desc = event.payload?.description || event.payload?.action || event.type;

  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${color} hover:bg-gray-800/50 
                     transition-colors text-xs flex-shrink-0`}>
      <span className="text-gray-500 w-16 shrink-0">{time}</span>
      <span className="w-4 shrink-0">{icon}</span>
      <span className="text-gray-300 w-20 shrink-0 font-semibold">{event.agent}</span>
      <span className={`${color.split(' ')[1]} truncate`}>
        {desc.length > 60 ? desc.slice(0, 60) + '…' : desc}
      </span>
      {event.targetAgent && (
        <span className="text-purple-400 ml-auto shrink-0">→ {event.targetAgent}</span>
      )}
      {event.payload?.duration != null && (
        <span className="text-gray-600 ml-auto shrink-0">{event.payload.duration}ms</span>
      )}
    </div>
  );
}
