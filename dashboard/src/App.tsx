import { useState, useEffect, useMemo, useCallback } from 'react';
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

/** Fetch existing events for a session via REST API */
async function fetchEvents(sessionId: string): Promise<AgentEvent[]> {
  try {
    const res = await fetch(`/api/events/${sessionId}`);
    if (!res.ok) return [];
    const body = await res.json();
    return body.events || [];
  } catch {
    return [];
  }
}

export default function App() {
  const { events: wsEvents, sessions, connected, subscribe } = useWebSocket();
  const [selectedSession, setSelectedSession] = useState<string | null>(getSessionFromUrl);
  const [restEvents, setRestEvents] = useState<AgentEvent[]>([]);

  // Merge WebSocket events with REST-fetched events, deduplicated by id
  const allEvents = useMemo(() => {
    const seen = new Set<string>();
    const merged: AgentEvent[] = [];
    // REST events first (older), then WS events (newer)
    for (const e of restEvents) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    for (const e of wsEvents) {
      if (!seen.has(e.id)) {
        seen.add(e.id);
        merged.push(e);
      }
    }
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }, [wsEvents, restEvents]);

  // Filter events by selected session
  const filteredEvents = useMemo(() => {
    if (!selectedSession) return allEvents;
    return allEvents.filter(e => e.sessionId === selectedSession);
  }, [allEvents, selectedSession]);

  // Create a keyed set of sessionIds from incoming events for the dropdown
  const availableSessions = useMemo(() => {
    const set = new Set(sessions);
    allEvents.forEach(e => set.add(e.sessionId));
    return Array.from(set).sort().reverse();
  }, [sessions, allEvents]);

  const handleSessionChange = useCallback((sessionId: string) => {
    setSelectedSession(sessionId);
    subscribe(sessionId);
    setRestEvents([]);
    // Fetch existing events from store
    fetchEvents(sessionId).then(events => {
      setRestEvents(events);
    });
    window.history.replaceState(null, '', `?session=${sessionId}`);
  }, [subscribe]);

  // Auto-select latest session if none selected
  useEffect(() => {
    if (!selectedSession && availableSessions.length > 0) {
      const latest = availableSessions[0];
      handleSessionChange(latest);
    }
  }, [selectedSession, availableSessions, handleSessionChange]);

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
