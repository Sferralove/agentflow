interface SessionSelectorProps {
  sessions: string[];
  selected: string | null;
  onChange: (sessionId: string) => void;
}

export default function SessionSelector({ sessions, selected, onChange }: SessionSelectorProps) {
  if (sessions.length === 0) return null;

  return (
    <select
      value={selected || ''}
      onChange={e => onChange(e.target.value)}
      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200
                 focus:outline-none focus:border-emerald-500 cursor-pointer"
    >
      {sessions.map(s => (
        <option key={s} value={s}>
          {s.replace('session-', '').slice(0, 8)}...
        </option>
      ))}
    </select>
  );
}
