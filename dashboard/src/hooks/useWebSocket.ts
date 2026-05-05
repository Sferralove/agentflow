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
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const currentSession = useRef<string | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}`);

    ws.onopen = () => {
      setConnected(true);
      reconnectAttempt.current = 0;
      // Re-subscribe to current session after reconnect
      if (currentSession.current) {
        ws.send(JSON.stringify({ type: 'subscribe', sessionId: currentSession.current }));
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt.current), 30000);
      reconnectAttempt.current++;
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === 'sessionList' && msg.sessions) {
          setSessions(msg.sessions);
        }
        if (msg.type === 'event' && msg.event) {
          setEvents(prev => [...prev.slice(-499), msg.event!]);
        }
      } catch { /* ignore malformed messages */ }
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const subscribe = useCallback((sessionId: string) => {
    currentSession.current = sessionId;
    // Don't clear events here — handled by loading state in App.tsx
    if (sessionId && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', sessionId }));
    }
  }, []);

  return { events, sessions, connected, subscribe };
}
