import type { AgentEvent } from '../types'

const TOOL_ICONS: Record<string, string> = {
  task: '📤', write: '✏️', edit: '📝', bash: '⚡',
}

const TYPE_COLORS: Record<string, string> = {
  'tool.start': 'text-blue-400',
  'tool.end': 'text-green-400',
  'session.error': 'text-red-400',
  'session.idle': 'text-gray-400',
  'session.created': 'text-blue-300',
  'session.compacted': 'text-purple-400',
}

export default function EventRow({ event }: { event: AgentEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString()
  const icon = TOOL_ICONS[event.tool || ''] || ''
  const color = TYPE_COLORS[event.type] || 'text-gray-400'
  const desc = event.tool
    ? `${event.tool}${event.input?.filePath ? ' ' + event.input.filePath : ''}${event.input?.command ? ' ' + (event.input.command as string).slice(0, 40) : ''}`
    : event.type

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-800 text-xs">
      <span className="text-gray-500 w-16 shrink-0">{time}</span>
      <span className={color + ' shrink-0'}>{icon}</span>
      <span className={color + ' truncate'}>{desc}</span>
      {event.duration != null && (
        <span className="text-gray-500 ml-auto shrink-0">{(event.duration / 1000).toFixed(1)}s</span>
      )}
      {event.error && (
        <span className="text-red-400 ml-1 shrink-0" title={event.error as string}>⚠️</span>
      )}
      {event.output && typeof event.output === 'string' && event.output.length < 50 && (
        <span className="text-green-400 ml-1 shrink-0">{event.output}</span>
      )}
    </div>
  )
}
