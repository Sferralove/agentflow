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
  const payload: Record<string, unknown> = {
    title: getTitle(raw, input),
    tool: raw.tool,
  }

  if (raw.input !== undefined) {
    payload.input = raw.input
  }

  if (raw.output !== undefined) {
    payload.output = raw.output
  }

  if (raw.error !== undefined) {
    payload.error = raw.error
  }

  if (raw.duration !== undefined) {
    payload.duration = raw.duration
  }

  addStringPayloadField(payload, 'command', input.command)
  addStringPayloadField(payload, 'filePath', input.filePath)
  addStringPayloadField(payload, 'subagentType', input.subagent_type)

  return payload
}

function addStringPayloadField(
  payload: Record<string, unknown>,
  key: string,
  value: unknown,
): void {
  if (isNonEmptyString(value)) {
    payload[key] = value
  }
}

function getTitle(raw: AgentEvent, input: Record<string, unknown>): string {
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
