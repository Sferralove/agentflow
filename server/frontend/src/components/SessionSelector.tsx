interface SessionSelectorProps {
  sessions: string[];
  selected: string | null;
  onSelect: (sessionId: string | null) => void;
}

export default function SessionSelector({ sessions, selected, onSelect }: SessionSelectorProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Sessions</label>
        <span className="text-xs text-gray-500">{sessions.length}</span>
      </div>
      <select
        value={selected || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-200
          focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400 transition-colors
          cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%239ca3af%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]
          bg-[length:12px] bg-[right_12px_center] bg-no-repeat pr-10"
      >
        <option value="">All Sessions</option>
        {sessions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
