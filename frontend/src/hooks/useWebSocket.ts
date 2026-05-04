import { useState, useEffect, useCallback, useRef } from 'react';
import type { AgentEvent } from '../types';

interface UseWebSocketReturn {
  events: AgentEvent[];
  connected: boolean;
  needsRefresh: boolean;
  acknowledgeRefresh: () => void;
  reconnect: () => void;
}

const RECONNECT_BASE = 500;
const RECONNECT_MAX = 8000;
const MAX_EVENTS = 200;

export function useWebSocket(url: string): UseWebSocketReturn {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'heartbeat') return;
        if (data.type === 'reload') {
          setNeedsRefresh(true);
          return;
        }
        if (data.type === 'event' && data.data) {
          setEvents((prev) => {
            const next = [...prev, data.data as AgentEvent];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        }
      } catch { /* ignore */ }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      const delay = Math.min(RECONNECT_BASE * Math.pow(2, retryRef.current), RECONNECT_MAX);
      retryRef.current++;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  return { events, connected, needsRefresh, acknowledgeRefresh: () => setNeedsRefresh(false), reconnect: connect };
}
