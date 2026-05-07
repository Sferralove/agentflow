import type { AgentEvent, SessionGraph } from '../types.js'
import { normalizeAgentEvent } from './eventNormalizer.js'
import { applyEventToGraph } from './graphProjector.js'
import {
  createPatchEnvelope,
  emptyRunSnapshot,
  makeTraceNodeId,
  type PatchEnvelope,
  type ProjectionResult,
  type Run,
  type RunSnapshot,
  type TimelineItem,
  type TraceNode,
  type TraceNodeKind,
  type TraceStatus,
} from './traceTypes.js'

interface TraceProjector {
  getSnapshot(): RunSnapshot | null
  applyRawEvent(raw: AgentEvent): ProjectionResult
}

export function createTraceProjector(initial?: RunSnapshot): TraceProjector {
  let snapshot = initial ? cloneSnapshot(initial) : null
  const seenRawIds = new Set(snapshot?.rawEvents.map((event) => event.id) ?? [])

  return {
    getSnapshot(): RunSnapshot | null {
      return snapshot
    },
    applyRawEvent(raw: AgentEvent): ProjectionResult {
      if (seenRawIds.has(raw.id)) {
        return {
          snapshot: requireSnapshot(snapshot, raw),
          patches: [],
        }
      }

      if (!snapshot) {
        snapshot = emptyRunSnapshot(inferRun(raw))
      }

      seenRawIds.add(raw.id)

      const patches: PatchEnvelope[] = []
      const emit = <T>(type: PatchEnvelope<T>['type'], payload: T): void => {
        snapshot!.lastSequence++
        patches.push(createPatchEnvelope({
          id: `patch_${snapshot!.lastSequence}`,
          runId: snapshot!.run.id,
          sequence: snapshot!.lastSequence,
          emittedAt: raw.timestamp,
          type,
          payload,
        }))
      }

      const graphBefore = snapshotGraphState(snapshot.graph)
      snapshot.rawEvents.push(raw)
      emit('raw.event', raw)

      const normalized = normalizeAgentEvent({
        raw,
        runId: snapshot.run.id,
        sequence: snapshot.lastSequence + 1,
      })
      snapshot.normalizedEvents.push(normalized)

      const node = buildTraceNode(snapshot.run.id, raw)
      upsertTraceNode(snapshot.traceNodes, node)
      emit('trace.node.upserted', node)

      const timelineItem = buildTimelineItem(snapshot.run.id, normalized.id, raw, normalized.kind, node)
      upsertTimelineItem(snapshot.timelineItems, timelineItem)
      emit('timeline.item.upserted', timelineItem)

      updateRun(snapshot.run, raw)
      emit('run.updated', snapshot.run)

      applyEventToGraph(snapshot.graph, raw)
      for (const node of changedGraphNodes(graphBefore, snapshot.graph)) {
        emit('graph.node.upserted', node)
      }
      for (const edge of changedGraphEdges(graphBefore, snapshot.graph)) {
        emit('graph.edge.upserted', edge)
      }

      return { snapshot, patches }
    },
  }
}

function inferRun(raw: AgentEvent): Run {
  return {
    id: `run_${raw.sessionId}`,
    title: `Run ${raw.sessionId.slice(-8)}`,
    rootSessionId: raw.sessionId,
    status: 'running',
    startedAt: raw.timestamp,
    lastSeenAt: raw.timestamp,
  }
}

function updateRun(run: Run, raw: AgentEvent): void {
  run.lastSeenAt = raw.timestamp

  if (raw.type === 'session.error' || raw.error) {
    run.status = 'error'
    return
  }

  if (raw.type === 'session.idle' && run.status !== 'error') {
    run.status = 'completed'
    run.completedAt ??= raw.timestamp
  }
}

function buildTraceNode(runId: string, raw: AgentEvent): TraceNode {
  const kind = inferTraceNodeKind(raw)
  const status = inferTraceStatus(raw)

  return {
    id: makeTraceNodeId(kind, [raw.id]),
    runId,
    kind,
    title: getTitle(raw),
    status,
    startedAt: raw.timestamp,
    endedAt: status === 'completed' || status === 'failed' ? raw.timestamp : undefined,
    sessionId: raw.sessionId,
    agentInstanceId: `${raw.sessionId}:${raw.agent || 'builder'}`,
    sourceEventIds: [raw.id],
    confidence: 'observed',
  }
}

function inferTraceNodeKind(raw: AgentEvent): TraceNodeKind {
  if (raw.type === 'session.error' || raw.error) return 'error'
  if (raw.tool === 'task') return 'delegation'
  if (raw.tool === 'bash') return 'command'
  if (raw.tool === 'write' || raw.tool === 'edit') return 'file_operation'
  if (raw.type === 'session.idle') return 'final_response'
  return 'tool_invocation'
}

function inferTraceStatus(raw: AgentEvent): TraceStatus {
  if (raw.type === 'session.error' || raw.error) return 'failed'
  if (raw.type === 'tool.start') return 'running'
  if (raw.type === 'tool.end' || raw.type === 'session.idle') return 'completed'
  return 'running'
}

function buildTimelineItem(
  runId: string,
  eventId: string,
  raw: AgentEvent,
  kind: TimelineItem['kind'],
  node: TraceNode,
): TimelineItem {
  return {
    id: `timeline_${raw.id}`,
    runId,
    traceNodeId: node.id,
    eventId,
    timestamp: raw.timestamp,
    title: node.title,
    kind,
    status: node.status,
    sourceEventIds: [raw.id],
  }
}

function upsertTraceNode(nodes: TraceNode[], next: TraceNode): void {
  const index = nodes.findIndex((node) => node.id === next.id)
  if (index === -1) {
    nodes.push(next)
    return
  }
  nodes[index] = next
}

function upsertTimelineItem(items: TimelineItem[], next: TimelineItem): void {
  const index = items.findIndex((item) => item.id === next.id)
  if (index === -1) {
    items.push(next)
    return
  }
  items[index] = next
}

function getTitle(raw: AgentEvent): string {
  const input = raw.input ?? {}
  const candidates = [
    input.description,
    input.command,
    input.filePath,
    input.subagent_type,
    raw.tool,
    raw.type,
  ]

  return candidates.find(isNonEmptyString) ?? raw.type
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function snapshotGraphState(graph: SessionGraph): Map<string, string> {
  return new Map([
    ...graph.nodes.map((node) => [`node:${node.id}`, JSON.stringify(node)] as const),
    ...graph.edges.map((edge) => [`edge:${edge.source}:${edge.target}`, JSON.stringify(edge)] as const),
  ])
}

function changedGraphNodes(before: Map<string, string>, graph: SessionGraph): SessionGraph['nodes'] {
  return graph.nodes.filter((node) => before.get(`node:${node.id}`) !== JSON.stringify(node))
}

function changedGraphEdges(before: Map<string, string>, graph: SessionGraph): SessionGraph['edges'] {
  return graph.edges.filter((edge) => before.get(`edge:${edge.source}:${edge.target}`) !== JSON.stringify(edge))
}

function cloneSnapshot(snapshot: RunSnapshot): RunSnapshot {
  return {
    run: { ...snapshot.run },
    lastSequence: snapshot.lastSequence,
    rawEvents: snapshot.rawEvents.map((event) => ({ ...event, input: event.input ? { ...event.input } : undefined })),
    normalizedEvents: snapshot.normalizedEvents.map((event) => ({
      ...event,
      payload: { ...event.payload },
      raw: { ...event.raw, input: event.raw.input ? { ...event.raw.input } : undefined },
    })),
    traceNodes: snapshot.traceNodes.map((node) => ({
      ...node,
      sourceEventIds: [...node.sourceEventIds],
    })),
    timelineItems: snapshot.timelineItems.map((item) => ({
      ...item,
      sourceEventIds: [...item.sourceEventIds],
    })),
    graph: {
      nodes: snapshot.graph.nodes.map((node) => ({ ...node })),
      edges: snapshot.graph.edges.map((edge) => ({ ...edge })),
    },
  }
}

function requireSnapshot(snapshot: RunSnapshot | null, raw: AgentEvent): RunSnapshot {
  if (snapshot) return snapshot
  return emptyRunSnapshot(inferRun(raw))
}
