import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentEvent } from '../types';

interface UseWebSocketReturn {
  events: AgentEvent[];
  connected: boolean;
  reconnect: () => void;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'event' && data.data) {
          setEvents((prev) => [...prev, data.data as AgentEvent]);
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }, [url]);

  useEffect(() => {
    connect();
    return () => { wsRef.current?.close(); };
  }, [connect]);

  return { events, connected, reconnect: connect };
}
