interface HeaderProps {
  sessionId: string
  connected: boolean
}

export default function Header({ sessionId, connected }: HeaderProps) {
  return (
    <header className="h-10 px-4 flex items-center justify-between bg-gray-900 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold">AgentFlow v2</h1>
        {sessionId && <span className="text-xs text-gray-400">· {sessionId}</span>}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span className="text-gray-400">{connected ? 'connected' : 'disconnected'}</span>
      </div>
    </header>
  )
}
