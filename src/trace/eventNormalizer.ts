import type { AgentEvent } from '../types.js'
import type { NormalizedEvent, NormalizedEventKind } from './traceTypes.js'

interface NormalizeAgentEventInput {
  raw: AgentEvent
  runId: string
  sequence: number
}

export function normalizeAgentEvent(input: NormalizeAgentEventInput): NormalizedEvent {
  const { raw, runId, sequence } = input
  const payload = buildPayload(raw)

  return {
    id: `norm_${raw.id}`,
    runId,
    sessionId: raw.sessionId,
    sequence,
    timestamp: raw.timestamp,
    kind: inferKind(raw),
    agentInstanceId: `${raw.sessionId}:${raw.agent || 'builder'}`,
    toolCallId: raw.id,
    payload,
    rawEventId: raw.id,
    raw,
  }
}

function inferKind(raw: AgentEvent): NormalizedEventKind {
  if (raw.type === 'session.error' || raw.error) {
    return 'error.detected'
  }

  if (raw.type.startsWith('session.')) {
    return 'session.lifecycle'
  }

  if (raw.tool === 'task' && raw.type === 'tool.start') {
    return 'delegation.started'
  }

  if (raw.tool === 'task' && raw.type === 'tool.end') {
    return 'delegation.completed'
  }

  if (raw.tool === 'bash' && raw.type === 'tool.end') {
    return 'command.executed'
  }

  if (raw.tool === 'write' || raw.tool === 'edit') {
    return 'file.changed'
  }

  if (raw.type === 'tool.start') {
    return 'tool.started'
  }

  if (raw.type === 'tool.end') {
    return 'tool.completed'
  }

  return 'session.lifecycle'
}

function buildPayload(raw: AgentEvent): Record<string, unknown> {
  const input = raw.input ?? {}

  return {
    title: getTitle(raw, input),
    tool: raw.tool,
    input: raw.input,
    output: raw.output,
    error: raw.error,
    duration: raw.duration,
    command: input.command,
    filePath: input.filePath,
    subagentType: input.subagent_type,
  }
}

function getTitle(raw: AgentEvent, input: Record<string, unknown>): unknown {
  return (
    input.description ??
    input.command ??
    input.filePath ??
    input.subagent_type ??
    raw.tool ??
    raw.type
  )
}
