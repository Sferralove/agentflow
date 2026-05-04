import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import { useWebSocket } from './hooks/useWebSocket';
import type { AgentEvent } from './types';

function App() {
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    fetch('/api/events')
      .then((res) => res.json())
      .then((data) => setEvents(data))
      .catch(() => {});
  }, []);

  // In Vite dev (port 5173), WS is on port 3001. In production, same origin.
  const wsUrl = window.location.port === '5173'
    ? 'ws://localhost:3001'
    : `ws://${window.location.host}`;
  const { events: wsEvents, connected, needsRefresh, acknowledgeRefresh } = useWebSocket(wsUrl);

  // Re-fetch all events when server signals external file change
  useEffect(() => {
    if (!needsRefresh) return;
    fetch('/api/events')
      .then((res) => res.json())
      .then((data) => {
        setEvents(data);
        acknowledgeRefresh();
      })
      .catch(() => acknowledgeRefresh());
  }, [needsRefresh, acknowledgeRefresh]);

  // Merge WS events with initial fetch
  useEffect(() => {
    if (wsEvents.length > 0) {
      setEvents((prev) => {
        const existingIds = new Set(prev.map(e => e.id));
        const newEvents = wsEvents.filter(e => !existingIds.has(e.id));
        return [...prev, ...newEvents];
      });
    }
  }, [wsEvents]);

  return <Dashboard events={events} connected={connected} onNewEvent={(event) => setEvents((prev) => [...prev, event])} />;
}

export default App;
