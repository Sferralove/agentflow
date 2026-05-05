import type { AgentEvent } from '../types'

const TOOL_ICONS: Record<string, string> = {
  task: '📤', write: '✏️', edit: '📝', bash: '⚡',
}

function eventDesc(evt: AgentEvent): string {
  if (evt.type === 'session.created') return 'session started'
  if (!evt.tool) return evt.type
  const parts: string[] = [evt.tool]
  if (evt.type === 'tool.start' && evt.input?.description) {
    parts.push((evt.input.description as string).slice(0, 50))
  } else if (evt.input?.command) {
    parts.push((evt.input.command as string).slice(0, 40))
  } else if (evt.input?.filePath) {
    parts.push(evt.input.filePath as string)
  }
  return parts.join(' ')
}

function sessionTint(sessionId: string): string {
  let hash = 0
  for (let i = 0; i < sessionId.length; i++) {
    hash = sessionId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = ((hash % 360) + 360) % 360
  return `hsla(${hue}, 40%, 25%, 0.10)`
}

export default function EventRow({ event, showSession }: { event: AgentEvent; showSession?: boolean }) {
  const time = new Date(event.timestamp).toLocaleTimeString()
  const icon = TOOL_ICONS[event.tool || ''] || (event.type === 'session.created' ? '🚀' : '')
  const isStart = event.type === 'tool.start'
  const isEnd = event.type === 'tool.end'
  const desc = eventDesc(event)
  const shortSid = event.sessionId.length > 12 ? event.sessionId.slice(-12) : event.sessionId

  return (
    <div
      className="flex items-center gap-2 py-1 px-2 border-b border-gray-800/50 text-xs hover:bg-gray-800/20 transition-colors"
      style={showSession ? { backgroundColor: sessionTint(event.sessionId) } : undefined}
    >
      <span className="text-gray-600 w-14 shrink-0 font-mono text-[10px]">{time}</span>
      {showSession && (
        <span className="text-gray-600 w-12 shrink-0 truncate font-mono text-[9px]" title={event.sessionId}>
          {shortSid}
        </span>
      )}
      <span className="shrink-0 text-sm">{icon}</span>
      <span className={`truncate ${isStart ? 'text-blue-400' : isEnd ? 'text-green-400' : 'text-blue-300'}`}>
        {desc}
      </span>
      {event.duration != null && (
        <span className="text-gray-600 ml-auto shrink-0 text-[10px]">{(event.duration / 1000).toFixed(1)}s</span>
      )}
      {event.error && (
        <span className="text-red-400 ml-1 shrink-0" title={String(event.error)}>⚠️</span>
      )}
    </div>
  )
}
