import { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import type { AgentEvent } from './types';

function App() {
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    fetch('/api/events')
      .then((res) => res.json())
      .then((data) => setEvents(data))
      .catch(() => {});
  }, []);

  return <Dashboard events={events} onNewEvent={(event) => setEvents((prev) => [...prev, event])} />;
}

export default App;
