// dashboard/src/hooks/useSSE.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent, SessionGraph } from '../types'
import { MOCK_EVENTS, MOCK_GRAPH } from '../data/mock'

function isMockMode(): boolean {
  return new URLSearchParams(window.location.search).get('mock') === 'true'
}

export function useSSE(sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [graph, setGraph] = useState<SessionGraph>({ nodes: [], edges: [] })
  const [connected, setConnected] = useState(false)
  const [isParent, setIsParent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [graphRefresh, setGraphRefresh] = useState(0)
  const eventSourceRef = useRef<EventSource | null>(null)

  // Mock mode: return hardcoded sample data instantly
  const mock = isMockMode()
  if (mock) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      setEvents(MOCK_EVENTS)
      setGraph(MOCK_GRAPH)
      setConnected(true)
      setIsParent(true)
    }, [])
    return { events, graph, connected, error }
  }

  const requestGraphRefresh = useCallback(() => {
    setGraphRefresh((value) => value + 1)
  }, [])

  // Detect if this is the parent session
  useEffect(() => {
    if (mock) return // skip in mock mode
    fetch('/api/sessions')
      .then(r => r.json())
      .then(d => {
        const sessions = d.sessions || []
        setIsParent(sessions.some((session: { id: string; type: string }) => (
          session.id === sessionId && session.type === 'parent'
        )))
      })
      .catch(() => setError('Unable to load sessions'))
  }, [sessionId, mock])

  // SSE for real-time events from selected session
  useEffect(() => {
    if (!sessionId) return

    const es = new EventSource(`/api/stream?session=${sessionId}`)
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
      setError(null)
    }
    es.onerror = () => {
      setConnected(false)
      setError('Session stream disconnected')
    }

    es.onmessage = (msg) => {
      try {
        const evt: AgentEvent = JSON.parse(msg.data)
        setEvents(prev => [...prev.slice(-999), evt])
        requestGraphRefresh()
      } catch {}
    }

    return () => {
      es.close()
      setConnected(false)
    }
  }, [requestGraphRefresh, sessionId])

  // Unified timeline: when parent selected, merge ALL sessions every 2s
  useEffect(() => {
    if (!sessionId || !isParent || mock) return

    const poll = setInterval(() => {
      fetch(`/api/events?session=${sessionId}&tree=true`)
        .then(r => r.json())
        .then((all: AgentEvent[]) => {
          setEvents(all)
          requestGraphRefresh()
        })
        .catch(() => setError('Unable to load unified timeline'))
    }, 2000)

    fetch(`/api/events?session=${sessionId}&tree=true`)
      .then(r => r.json())
      .then((all: AgentEvent[]) => {
        setEvents(all)
        requestGraphRefresh()
      })
      .catch(() => setError('Unable to load unified timeline'))

    return () => clearInterval(poll)
  }, [requestGraphRefresh, sessionId, isParent, mock])

  // Event-driven graph refresh with a slow fallback poll. Parent sessions use
  // tree mode so child-session tool metrics are merged into subagent nodes.
  useEffect(() => {
    if (!sessionId || mock) return
    const graphUrl = `/api/agents/${sessionId}${isParent ? '?tree=true' : ''}`

    const fetchGraph = () => {
      fetch(graphUrl)
        .then(r => r.json())
        .then((g: SessionGraph) => {
          setGraph(g)
          setError(null)
        })
        .catch(() => setError('Unable to load agent graph'))
    }

    const debounce = window.setTimeout(fetchGraph, 120)
    const poll = window.setInterval(fetchGraph, 10000)

    return () => {
      window.clearTimeout(debounce)
      window.clearInterval(poll)
    }
  }, [sessionId, isParent, mock, graphRefresh])

  return { events, graph, connected, error }
}
