export type EventType =
  | 'session.created'
  | 'session.error'
  | 'session.compacted'
  | 'session.idle'
  | 'tool.start'
  | 'tool.end'

export interface AgentEvent {
  type: EventType
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

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'compacted'

export interface AgentNode {
  id: string
  name: string
  type: 'main' | 'subagent'
  parentId?: string
  status: AgentStatus
  sessionId: string
  startedAt: number
  lastSeenAt?: number
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
