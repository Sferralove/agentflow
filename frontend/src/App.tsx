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

  const { events: wsEvents } = useWebSocket('ws://localhost:3001');

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

  return <Dashboard events={events} onNewEvent={(event) => setEvents((prev) => [...prev, event])} />;
}

export default App;
