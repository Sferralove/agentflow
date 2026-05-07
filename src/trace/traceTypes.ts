import type { AgentEdge, AgentEvent, AgentNode, SessionGraph } from '../types.js'

export type RunStatus = 'running' | 'completed' | 'error' | 'interrupted'
export type ArtifactConfidence = 'observed' | 'inferred' | 'missing'
export type TraceConfidence = 'observed' | 'inferred'
export type TraceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stale'

export interface RunArtifact {
  text: string
  timestamp: number
  sourceEventIds: string[]
  confidence: ArtifactConfidence
}

export interface Run {
  id: string
  title: string
  rootSessionId: string
  status: RunStatus
  startedAt: number
  completedAt?: number
  lastSeenAt: number
  userInput?: RunArtifact
  finalResponse?: RunArtifact
}

export type NormalizedEventKind =
  | 'user.input'
  | 'session.lifecycle'
  | 'tool.started'
  | 'tool.completed'
  | 'delegation.started'
  | 'delegation.completed'
  | 'file.changed'
  | 'command.executed'
  | 'error.detected'
  | 'final.response'

export interface NormalizedEvent {
  id: string
  runId: string
  sessionId: string
  sequence: number
  timestamp: number
  kind: NormalizedEventKind
  agentInstanceId?: string
  toolCallId?: string
  parentId?: string
  payload: Record<string, unknown>
  rawEventId: string
  raw: AgentEvent
}

export type TraceNodeKind =
  | 'user_input'
  | 'agent_work'
  | 'delegation'
  | 'tool_invocation'
  | 'file_operation'
  | 'command'
  | 'error'
  | 'final_response'

export interface TraceNode {
  id: string
  runId: string
  kind: TraceNodeKind
  parentId?: string
  title: string
  status: TraceStatus
  startedAt?: number
  endedAt?: number
  sessionId?: string
  agentInstanceId?: string
  sourceEventIds: string[]
  confidence: TraceConfidence
}

export interface TimelineItem {
  id: string
  runId: string
  traceNodeId?: string
  eventId: string
  timestamp: number
  title: string
  detail?: string
  kind: NormalizedEventKind
  status: TraceStatus
  sourceEventIds: string[]
}

export type PatchType =
  | 'raw.event'
  | 'timeline.item.upserted'
  | 'trace.node.upserted'
  | 'trace.node.completed'
  | 'graph.node.upserted'
  | 'graph.edge.upserted'
  | 'run.updated'

export interface PatchEnvelope<T = unknown> {
  id: string
  runId: string
  sequence: number
  emittedAt: number
  type: PatchType
  payload: T
}

export interface RunSnapshot {
  run: Run
  lastSequence: number
  rawEvents: AgentEvent[]
  normalizedEvents: NormalizedEvent[]
  traceNodes: TraceNode[]
  timelineItems: TimelineItem[]
  graph: SessionGraph
}

export interface ProjectionResult {
  snapshot: RunSnapshot
  patches: PatchEnvelope[]
}

export function makeTraceNodeId(kind: TraceNodeKind, sourceEventIds: string[]): string {
  return `trace_${kind}_${sourceEventIds.join('_')}`
}

export function createPatchEnvelope<T>(patch: PatchEnvelope<T>): PatchEnvelope<T> {
  return patch
}

export function emptyRunSnapshot(run: Run): RunSnapshot {
  return {
    run,
    lastSequence: 0,
    rawEvents: [],
    normalizedEvents: [],
    traceNodes: [],
    timelineItems: [],
    graph: { nodes: [] as AgentNode[], edges: [] as AgentEdge[] },
  }
}
