interface SessionInfo {
  id: string
  type: 'parent' | 'child'
}

interface HeaderProps {
  sessionId: string
  sessions: SessionInfo[]
  isParent: boolean
  onSessionChange: (id: string) => void
  connected: boolean
}

export default function Header({ sessionId, sessions, isParent, onSessionChange, connected }: HeaderProps) {
  const shortId = (id: string) => id.length > 24 ? id.slice(-12) : id

  return (
    <header className="h-10 px-4 flex items-center justify-between bg-gray-900 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold">AgentFlow v2</h1>
        {sessions.length > 0 && (
          <select
            className="bg-gray-800 text-xs text-gray-300 border border-gray-700 rounded px-2 py-0.5 outline-none"
            value={sessionId}
            onChange={e => onSessionChange(e.target.value)}
          >
            {sessions.map(s => (
              <option key={s.id} value={s.id}>
                {s.type === 'parent' ? '📁' : ' └ '}{shortId(s.id)}
              </option>
            ))}
          </select>
        )}
        {sessions.length === 0 && (
          <span className="text-xs text-gray-500">no sessions — start OpenCode</span>
        )}
        {isParent && sessions.length > 1 && (
          <span className="text-xs text-blue-400">unified timeline ({sessions.length} sessions)</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-400">{connected ? 'connected' : 'disconnected'}</span>
      </div>
    </header>
  )
}
