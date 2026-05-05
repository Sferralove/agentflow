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

function eventDesc(evt: AgentEvent): string {
  if (!evt.tool) return evt.type
  const parts: string[] = [evt.tool]
  if (evt.input?.description) {
    parts.push((evt.input.description as string).slice(0, 40))
  } else if (evt.input?.command) {
    parts.push((evt.input.command as string).slice(0, 40))
  } else if (evt.input?.filePath) {
    parts.push(evt.input.filePath as string)
  }
  return parts.join(' ')
}

// Distinct background tint per session (hash sessionId → color)
function sessionTint(sessionId: string): string {
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) {
    hash = sessionId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsla(${hue}, 40%, 30%, 0.15)`
}

export default function EventRow({ event, showSession }: { event: AgentEvent; showSession?: boolean }) {
  const time = new Date(event.timestamp).toLocaleTimeString()
  const icon = TOOL_ICONS[event.tool || ''] || ''
  const color = TYPE_COLORS[event.type] || 'text-gray-400'
  const desc = eventDesc(event)
  const outputText = typeof event.output === 'string' && event.output.length < 50 ? event.output : null
  const shortSid = event.sessionId.length > 12 ? event.sessionId.slice(-12) : event.sessionId

  return (
    <div
      className="flex items-center gap-2 py-1.5 border-b border-gray-800 text-xs"
      style={showSession ? { backgroundColor: sessionTint(event.sessionId) } : undefined}
    >
      <span className="text-gray-500 w-16 shrink-0">{time}</span>
      {showSession && (
        <span className="text-gray-600 w-14 shrink-0 truncate font-mono text-[10px]" title={event.sessionId}>
          {shortSid}
        </span>
      )}
      <span className={color + ' shrink-0'}>{icon}</span>
      <span className={color + ' truncate'}>{desc}</span>
      {event.duration != null && (
        <span className="text-gray-500 ml-auto shrink-0">{(event.duration / 1000).toFixed(1)}s</span>
      )}
      {event.error && (
        <span className="text-red-400 ml-1 shrink-0" title={event.error as string}>⚠️</span>
      )}
      {outputText && (
        <span className="text-green-400 ml-1 shrink-0">{outputText}</span>
      )}
    </div>
  )
}
