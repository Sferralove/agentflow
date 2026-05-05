// dashboard/src/hooks/useSSE.ts
import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, SessionGraph } from '../types'

const API_BASE = 'http://localhost:3001'

export function useSSE(sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [graph, setGraph] = useState<SessionGraph>({ nodes: [], edges: [] })
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const es = new EventSource(`${API_BASE}/api/stream?session=${sessionId}`)
    eventSourceRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.onmessage = (msg) => {
      try {
        const evt: AgentEvent = JSON.parse(msg.data)
        setEvents(prev => [...prev.slice(-499), evt])
      } catch { /* skip malformed */ }
    }

    fetch(`${API_BASE}/api/agents/${sessionId}`)
      .then(r => r.json())
      .then(g => setGraph(g))
      .catch(() => {})

    return () => {
      es.close()
      setConnected(false)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId || events.length === 0) return
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/agents/${sessionId}`)
        .then(r => r.json())
        .then(g => setGraph(g))
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [events.length, sessionId])

  return { events, graph, connected }
}
