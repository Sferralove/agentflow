// dashboard/src/App.tsx
import { useState, useMemo } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { useSSE } from './hooks/useSSE'
import type { AgentNode } from './types'
import Header from './components/Header'
import AgentGraph from './components/AgentGraph'
import DetailPanel from './components/DetailPanel'

const SESSION_ID = new URLSearchParams(window.location.search).get('session') || 'unknown'

export default function App() {
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null)
  const { events, graph, connected } = useSSE(SESSION_ID)

  const nodeEvents = useMemo(
    () => events.filter(e => !selectedNode || e.agent === selectedNode.id),
    [events, selectedNode],
  )

  return (
    <div className="h-screen flex flex-col">
      <Header sessionId={SESSION_ID} connected={connected} />
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
