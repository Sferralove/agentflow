import type { SessionTree } from '../types';

interface SessionSelectorProps {
  sessions: SessionTree[];
  selected: string | null;
  onChange: (sessionId: string) => void;
}

function shortId(id: string): string {
  return id.includes('-') ? id.split('-').pop()!.slice(0, 10) : id.slice(0, 10);
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
        <optgroup key={s.id} label={`◉ ${shortId(s.id)}`}>
          {s.children.length > 0 ? (
            s.children.map(c => (
              <option key={c} value={c}>&nbsp;&nbsp;└─ {shortId(c)}</option>
            ))
          ) : (
            <option value={s.id}>{shortId(s.id)}</option>
          )}
        </optgroup>
      ))}
    </select>
  );
}
