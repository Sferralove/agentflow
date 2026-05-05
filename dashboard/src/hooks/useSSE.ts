// dashboard/src/hooks/useSSE.ts
import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, SessionGraph } from '../types'

const API_BASE = ''

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

    // Poll graph every 2s to pick up changes
    const poll = setInterval(() => {
      fetch(`${API_BASE}/api/agents/${sessionId}`)
        .then(r => r.json())
        .then(g => setGraph(g))
        .catch(() => {})
    }, 2000)

    return () => {
      es.close()
      clearInterval(poll)
      setConnected(false)
    }
  }, [sessionId])

  return { events, graph, connected }
}
