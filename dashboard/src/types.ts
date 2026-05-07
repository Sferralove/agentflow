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

// ─── Trace Engine Types (v1) ───

export type RunStatus = 'running' | 'completed' | 'error' | 'interrupted';
export type TraceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale';

export interface RunArtifact {
  text: string;
  timestamp: number;
  sourceEventIds: string[];
  confidence: 'observed' | 'inferred' | 'missing';
}

export interface Run {
  id: string;
  title: string;
  rootSessionId: string;
  status: RunStatus;
  startedAt: number;
  completedAt?: number;
  lastSeenAt: number;
  userInput?: RunArtifact;
  finalResponse?: RunArtifact;
}

export interface TraceNode {
  id: string;
  runId: string;
  kind:
    | 'user_input'
    | 'agent_work'
    | 'delegation'
    | 'tool_invocation'
    | 'file_operation'
    | 'command'
    | 'error'
    | 'final_response';
  parentId?: string;
  title: string;
  status: TraceStatus;
  startedAt?: number;
  endedAt?: number;
  sessionId?: string;
  agentInstanceId?: string;
  sourceEventIds: string[];
  confidence: 'observed' | 'inferred';
}

export interface TimelineItem {
  id: string;
  runId: string;
  traceNodeId?: string;
  eventId: string;
  timestamp: number;
  title: string;
  detail?: string;
  kind: string;
  status: TraceStatus;
  sourceEventIds: string[];
}

export interface RunSnapshot {
  run: Run;
  lastSequence: number;
  rawEvents: AgentEvent[];
  normalizedEvents: unknown[];
  traceNodes: TraceNode[];
  timelineItems: TimelineItem[];
  graph: SessionGraph;
}

export interface PatchEnvelope<T = unknown> {
  id: string;
  runId: string;
  sequence: number;
  emittedAt: number;
  type:
    | 'raw.event'
    | 'timeline.item.upserted'
    | 'trace.node.upserted'
    | 'trace.node.completed'
    | 'graph.node.upserted'
    | 'graph.edge.upserted'
    | 'run.updated';
  payload: T;
}
