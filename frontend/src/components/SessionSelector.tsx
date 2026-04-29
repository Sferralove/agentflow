interface SessionSelectorProps {
  sessions: string[];
  selected: string | null;
  onSelect: (sessionId: string | null) => void;
}

export default function SessionSelector({ sessions, selected, onSelect }: SessionSelectorProps) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">Sessions</label>
      <select
        value={selected || ''}
        onChange={(e) => onSelect(e.target.value || null)}
        className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm"
      >
        <option value="">All Sessions</option>
        {sessions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
    </div>
  );
}
