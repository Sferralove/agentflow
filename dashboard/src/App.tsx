// dashboard/src/App.tsx
import { useState, useEffect, useMemo } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { useSSE } from './hooks/useSSE'
import type { AgentNode } from './types'
import Header from './components/Header'
import AgentGraph from './components/AgentGraph'
import DetailPanel from './components/DetailPanel'

function getSessionParam(): string | null {
  return new URLSearchParams(window.location.search).get('session')
}

interface SessionInfo {
  id: string
  type: 'parent' | 'child'
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(getSessionParam)
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null)
  const { events, graph, connected } = useSSE(sessionId)

  const isParent = sessions.length > 0 && sessions[0]?.id === sessionId

  // Fetch available sessions
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(d => {
        const list: SessionInfo[] = d.sessions || []
        setSessions(list)
        if (!getSessionParam() && list.length > 0 && !sessionId) {
          setSessionId(list[0].id)
        }
      })
      .catch(() => {})
  }, [])

  // Filter visible events: only tool.start, tool.end, session.created
  const visibleEvents = useMemo(() => {
    const keep = new Set(['tool.start', 'tool.end', 'session.created'])
    return events.filter(e => keep.has(e.type))
  }, [events])

  // Filter events: by selected node, or show all in unified mode
  const displayEvents = useMemo(() => {
    if (!selectedNode) return visibleEvents
    return visibleEvents.filter(e => e.agent === selectedNode.id)
  }, [visibleEvents, selectedNode])

  return (
    <div className="h-screen flex flex-col">
      <Header
        sessionId={sessionId || '—'}
        sessions={sessions}
        isParent={isParent}
        onSessionChange={setSessionId}
        connected={connected}
      />
      <div className="flex-1 flex">
        <div className="w-1/3 border-r border-gray-800 bg-gray-900 overflow-hidden">
          <DetailPanel
            selectedNode={selectedNode}
            events={displayEvents}
            unified={isParent && !selectedNode}
          />
        </div>
        <div className="w-2/3">
          <ReactFlowProvider>
            <AgentGraph
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeSelect={setSelectedNode}
            />
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}
