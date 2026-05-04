import type { AgentEvent } from '../types';

const BORDER_COLORS: Record<string, string> = {
  start: 'border-emerald-500',
  complete: 'border-blue-500',
  dispatch: 'border-purple-500',
  task: 'border-yellow-500',
  error: 'border-red-500',
  message: 'border-gray-500',
};

const TEXT_COLORS: Record<string, string> = {
  start: 'text-emerald-400',
  complete: 'text-blue-400',
  dispatch: 'text-purple-400',
  task: 'text-yellow-400',
  error: 'text-red-400',
  message: 'text-gray-400',
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
  const border = BORDER_COLORS[event.type] || 'border-gray-600';
  const text = TEXT_COLORS[event.type] || 'text-gray-500';
  const icon = TYPE_ICONS[event.type] || '·';
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const desc = event.payload?.description || event.payload?.action || event.type;

  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${border} ${text} hover:bg-gray-800/50 
                     transition-colors text-xs flex-shrink-0`}>
      <span className="text-gray-500 w-16 shrink-0">{time}</span>
      <span className="w-4 shrink-0">{icon}</span>
      <span className="text-gray-300 w-20 shrink-0 font-semibold">{event.agent}</span>
      <span className={`${text} truncate`}>
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
