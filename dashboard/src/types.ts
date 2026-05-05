// dashboard/src/types.ts

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'compacted'

export interface AgentNode {
  id: string
  name: string
  type: 'main' | 'subagent'
  parentId?: string
  status: AgentStatus
  sessionId: string
  startedAt: number
  completedAt?: number
  tasksCompleted: number
  tasksFailed: number
}

export interface AgentEdge {
  id: string
  source: string
  target: string
  description: string
}

export interface SessionGraph {
  nodes: AgentNode[]
  edges: AgentEdge[]
}

export interface AgentEvent {
  type: string
  id: string
  sessionId: string
  timestamp: number
  agent: string
  tool?: string
  input?: Record<string, unknown>
  output?: unknown
  duration?: number
  error?: string | null
}

export const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
  compacted: '#8b5cf6',
}
