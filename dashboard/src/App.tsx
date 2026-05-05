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

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(getSessionParam)
  const [sessions, setSessions] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null)
  const { events, graph, connected } = useSSE(sessionId)

  // Fetch available sessions
  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(d => {
        setSessions(d.sessions || [])
        // Auto-select first session if no session param
        if (!getSessionParam() && d.sessions.length > 0 && !sessionId) {
          setSessionId(d.sessions[0])
        }
      })
      .catch(() => {})
  }, [])

  const nodeEvents = useMemo(
    () => events.filter(e => !selectedNode || e.agent === selectedNode.id),
    [events, selectedNode],
  )

  return (
    <div className="h-screen flex flex-col">
      <Header
        sessionId={sessionId || '—'}
        sessions={sessions}
        onSessionChange={setSessionId}
        connected={connected}
      />
      <div className="flex-1 flex">
        <div className="w-1/3 border-r border-gray-800 bg-gray-900 overflow-hidden">
          <DetailPanel selectedNode={selectedNode} events={nodeEvents} />
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
