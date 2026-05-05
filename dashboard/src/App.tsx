import { useState, useEffect, useMemo, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import type { AgentEvent, SessionTree } from './types';
import StatsBar from './components/StatsBar';
import SessionSelector from './components/SessionSelector';
import Timeline from './components/Timeline';
import FlowGraph from './components/FlowGraph';

function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') || null;
}

/** Fetch existing events for a session via REST API, optionally includes child events */
async function fetchEvents(sessionId: string, includeChildren?: boolean, onError?: (msg: string) => void): Promise<AgentEvent[]> {
  try {
    const url = includeChildren
      ? `/api/events/${sessionId}?children=true`
      : `/api/events/${sessionId}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const body = await res.json();
    return body.events || [];
  } catch {
    onError?.('Failed to fetch events');
    return [];
  }
}

/** Fetch session tree from backend */
async function fetchSessionTree(): Promise<SessionTree[]> {
  try {
    const res = await fetch('/api/session-tree');
    if (!res.ok) return [];
    const body = await res.json();
    return body.tree || [];
  } catch {
    return [];
  }
}

export default function App() {
  const { events: wsEvents, sessions, connected, subscribe } = useWebSocket();
  const [selectedSession, setSelectedSession] = useState<string | null>(getSessionFromUrl);
  const [restEvents, setRestEvents] = useState<AgentEvent[]>([]);
  const [sessionTree, setSessionTree] = useState<SessionTree[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Fetch session tree on mount, on sessions change, and every 30s
  useEffect(() => {
    fetchSessionTree().then(setSessionTree);
    const interval = setInterval(() => {
      fetchSessionTree().then(setSessionTree);
    }, 30000);
    return () => clearInterval(interval);
  }, [sessions]);

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

  // Filter events by selected session OR any of its child sessions
  const filteredEvents = useMemo(() => {
    if (!selectedSession) return allEvents;
    // Get all session IDs in this group (selected + its children)
    const groupIds = new Set<string>([selectedSession]);
    for (const node of sessionTree) {
      if (node.id === selectedSession) {
        node.children.forEach(c => groupIds.add(c));
      }
    }
    return allEvents.filter(e => groupIds.has(e.sessionId));
  }, [allEvents, selectedSession, sessionTree]);

  const handleSessionChange = useCallback((sessionId: string, updateUrl = true) => {
    setSelectedSession(sessionId);
    subscribe(sessionId);
    setLoading(true);
    setFetchError(null);
    // Fetch events with children=true so we get full picture
    fetchEvents(sessionId, true, setFetchError).then(events => {
      setRestEvents(events);
      setLoading(false);
    });
    if (updateUrl) {
      window.history.replaceState(null, '', `?session=${sessionId}`);
    }
  }, [subscribe]);

  // Handle browser back/forward navigation
  useEffect(() => {
    const handler = () => {
      const sessionId = getSessionFromUrl();
      if (sessionId && sessionId !== selectedSession) {
        handleSessionChange(sessionId, false);
      }
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, [selectedSession, handleSessionChange]);

  // Auto-select latest session if none selected
  useEffect(() => {
    if (!selectedSession && sessionTree.length > 0) {
      const latest = sessionTree[0].id;
      handleSessionChange(latest, false);
    }
  }, [selectedSession, sessionTree, handleSessionChange]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden font-mono">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-wide text-emerald-400">AGENT FLOW</h1>
          {loading && (
            <span className="text-xs text-gray-500 animate-pulse">loading...</span>
          )}
          <SessionSelector
            sessions={sessionTree}
            selected={selectedSession}
            onChange={handleSessionChange}
          />
        </div>
        <StatsBar events={filteredEvents} connected={connected} />
      </header>
      {fetchError && (
        <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 text-xs text-red-400">
          ⚠ {fetchError}
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        <Timeline events={filteredEvents} />
        <FlowGraph events={filteredEvents} />
      </div>
    </div>
  );
}
