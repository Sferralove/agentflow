import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentEvent, WSMessage } from '../types';

interface UseWebSocketReturn {
  events: AgentEvent[];
  sessions: string[];
  connected: boolean;
  subscribe: (sessionId: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === 'sessionList' && msg.sessions) {
          setSessions(msg.sessions);
        }
        if (msg.type === 'event' && msg.event) {
          setEvents(prev => [...prev, { ...msg.event!, timestamp: msg.event!.timestamp || Date.now() }]);
        }
      } catch {}
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const subscribe = useCallback((sessionId: string) => {
    setEvents([]);
    wsRef.current?.send(JSON.stringify({ type: 'subscribe', sessionId }));
  }, []);

  return { events, sessions, connected, subscribe };
}
