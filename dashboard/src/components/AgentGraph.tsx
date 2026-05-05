import { useCallback, useEffect, useMemo } from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  type Node, type Edge,
  useNodesState, useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import dagre from 'dagre'
import type { AgentNode as AgentNodeType, AgentEdge as AgentEdgeType } from '../types'
import AgentNodeComponent from './AgentNode'

const nodeTypes = { agentNode: AgentNodeComponent }
const NODE_W = 160
const NODE_H = 70

function layoutNodes(nodes: AgentNodeType[], edges: AgentEdgeType[]): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80 })

  nodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }))
  edges.forEach(e => g.setEdge(e.source, e.target))

  dagre.layout(g)

  const laidNodes: Node[] = nodes.map(n => {
    const pos = g.node(n.id)
    return {
      id: n.id,
      type: 'agentNode',
      position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 },
      data: n,
    }
  })

  const laidEdges: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.description.slice(0, 30),
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#6b7280', strokeWidth: 2 },
  }))

  return { nodes: laidNodes, edges: laidEdges }
}

interface AgentGraphProps {
  nodes: AgentNodeType[]
  edges: AgentEdgeType[]
  onNodeSelect: (node: AgentNodeType | null) => void
}

export default function AgentGraph({ nodes, edges, onNodeSelect }: AgentGraphProps) {
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState([])
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState([])

  const layout = useMemo(() => layoutNodes(nodes, edges), [nodes, edges])

  useEffect(() => {
    setFlowNodes(layout.nodes)
    setFlowEdges(layout.edges)
  }, [layout, setFlowNodes, setFlowEdges])

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
        fitViewOptions={{ padding: 0.3 }}
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
