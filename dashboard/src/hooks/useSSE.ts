// dashboard/src/hooks/useSSE.ts
import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, SessionGraph } from '../types'

export function useSSE(sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [graph, setGraph] = useState<SessionGraph>({ nodes: [], edges: [] })
  const [connected, setConnected] = useState(false)
  const [isParent, setIsParent] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Detect if this is the parent session
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(d => {
        const sessions = d.sessions || []
        setIsParent(sessions.length > 0 && sessions[0]?.id === sessionId)
      })
      .catch(() => {})
  }, [sessionId])

  // SSE for real-time events from selected session
  useEffect(() => {
    if (!sessionId) return

    const es = new EventSource(`/api/stream?session=${sessionId}`)
    eventSourceRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.onmessage = (msg) => {
      try {
        const evt: AgentEvent = JSON.parse(msg.data)
        setEvents(prev => [...prev.slice(-999), evt])
      } catch {}
    }

    return () => {
      es.close()
      setConnected(false)
    }
  }, [sessionId])

  // Unified timeline: when parent selected, merge ALL sessions every 2s
  useEffect(() => {
    if (!sessionId || !isParent) return

    const poll = setInterval(() => {
      fetch(`/api/events?session=${sessionId}&tree=true`)
        .then(r => r.json())
        .then((all: AgentEvent[]) => setEvents(all))
        .catch(() => {})
    }, 2000)

    // Immediate first fetch
    fetch(`/api/events?session=${sessionId}&tree=true`)
      .then(r => r.json())
      .then((all: AgentEvent[]) => setEvents(all))
      .catch(() => {})

    return () => clearInterval(poll)
  }, [sessionId, isParent])

  // Poll graph every 2s
  useEffect(() => {
    if (!sessionId) return
    const poll = setInterval(() => {
      fetch(`/api/agents/${sessionId}`)
        .then(r => r.json())
        .then(g => setGraph(g))
        .catch(() => {})
    }, 2000)

    fetch(`/api/agents/${sessionId}`)
      .then(r => r.json())
      .then(g => setGraph(g))
      .catch(() => {})

    return () => clearInterval(poll)
  }, [sessionId])

  return { events, graph, connected }
}
