interface SessionInfo {
  id: string;
  type: 'parent' | 'child';
}

interface HeaderProps {
  sessionId: string;
  sessions: SessionInfo[];
  isParent: boolean;
  onSessionChange: (id: string) => void;
  connected: boolean;
}

export default function Header({
  sessionId,
  sessions,
  isParent,
  onSessionChange,
  connected,
}: HeaderProps) {
  const shortId = (id: string) => (id.length > 24 ? id.slice(-12) : id);

  return (
    <header className="h-14 shrink-0 border-b border-gray-800/80 bg-[#080b14]/95 px-4">
      <div className="flex h-full items-center justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-blue-500/30 bg-blue-500/10 text-sm font-bold text-blue-300">
            AF
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-4 text-gray-100">
              AgentFlow
            </h1>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-gray-600">
              Live orchestration monitor
            </div>
          </div>
          {sessions.length > 0 && (
            <select
              className="ml-3 h-8 rounded-md border border-gray-700 bg-gray-900 px-2 text-xs text-gray-300 outline-none transition-colors hover:border-gray-600 focus:border-blue-500"
              value={sessionId}
              onChange={(e) => onSessionChange(e.target.value)}
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.type === 'parent' ? 'parent · ' : 'child · '}
                  {shortId(s.id)}
                </option>
              ))}
            </select>
          )}
          {sessions.length === 0 && (
            <span className="ml-2 text-xs text-gray-500">
              no sessions — start OpenCode
            </span>
          )}
          {isParent && sessions.length > 1 && (
            <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-300">
              unified timeline ({sessions.length} sessions)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 rounded-full border border-gray-800 bg-gray-950 px-3 py-1.5 text-xs">
          <span
            className={`h-2 w-2 rounded-full ${
              connected
                ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]'
                : 'bg-red-400'
            }`}
          />
          <span className="font-medium text-gray-400">
            {connected ? 'connected' : 'disconnected'}
          </span>
        </div>
      </div>
    </header>
  );
}
