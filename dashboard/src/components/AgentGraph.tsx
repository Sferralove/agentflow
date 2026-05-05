import { useCallback } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  type Node, type Edge,
  useNodesState, useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { AgentNode as AgentNodeType, AgentEdge as AgentEdgeType } from '../types'
import AgentNodeComponent from './AgentNode'

const nodeTypes = { agentNode: AgentNodeComponent }

interface AgentGraphProps {
  nodes: AgentNodeType[]
  edges: AgentEdgeType[]
  onNodeSelect: (node: AgentNodeType | null) => void
}

export default function AgentGraph({ nodes, edges, onNodeSelect }: AgentGraphProps) {
  const rn: Node[] = nodes.map(n => ({
    id: n.id,
    type: 'agentNode',
    position: { x: 0, y: 0 },
    data: n,
  }))

  const re: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.description.slice(0, 30),
    animated: true,
    style: { stroke: '#6b7280' },
  }))

  const [flowNodes, , onNodesChange] = useNodesState(rn)
  const [flowEdges, , onEdgesChange] = useEdgesState(re)

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeSelect(node.data as AgentNodeType)
  }, [onNodeSelect])

  const onPaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#374151" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as AgentNodeType
            const colors: Record<string, string> = {
              idle: '#6b7280', running: '#3b82f6', completed: '#10b981',
              error: '#ef4444', compacted: '#8b5cf6',
            }
            return colors[d.status] || '#6b7280'
          }}
          style={{ background: '#1f2937' }}
        />
      </ReactFlow>
    </div>
  )
}
