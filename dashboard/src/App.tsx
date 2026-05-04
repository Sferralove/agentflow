import { useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import type { AgentEvent } from './types';
import StatsBar from './components/StatsBar';
import SessionSelector from './components/SessionSelector';
import Timeline from './components/Timeline';
import FlowGraph from './components/FlowGraph';

function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') || null;
}

export default function App() {
  const { events, sessions, connected, subscribe } = useWebSocket();
  const [selectedSession, setSelectedSession] = useState<string | null>(getSessionFromUrl);

  // Filter events by selected session
  const filteredEvents = useMemo(() => {
    if (!selectedSession) return events;
    return events.filter(e => e.sessionId === selectedSession);
  }, [events, selectedSession]);

  // Create a keyed set of sessionIds from incoming events for the dropdown
  const availableSessions = useMemo(() => {
    const set = new Set(sessions);
    events.forEach(e => set.add(e.sessionId));
    return Array.from(set).sort().reverse();
  }, [sessions, events]);

  // Auto-select latest session if none selected
  useEffect(() => {
    if (!selectedSession && availableSessions.length > 0) {
      const latest = availableSessions[0];
      setSelectedSession(latest);
      subscribe(latest);
      window.history.replaceState(null, '', `?session=${latest}`);
    }
  }, [selectedSession, availableSessions, subscribe]);

  const handleSessionChange = (sessionId: string) => {
    setSelectedSession(sessionId);
    subscribe(sessionId);
    window.history.replaceState(null, '', `?session=${sessionId}`);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden font-mono">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-wide text-emerald-400">AGENT FLOW</h1>
          <SessionSelector
            sessions={availableSessions}
            selected={selectedSession}
            onChange={handleSessionChange}
          />
        </div>
        <StatsBar events={filteredEvents} connected={connected} />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Timeline events={filteredEvents} />
        <FlowGraph events={filteredEvents} />
      </div>
    </div>
  );
}
