import { expect, test } from 'bun:test'
import { normalizeAgentEvent } from '../src/trace/eventNormalizer.js'
import type { AgentEvent } from '../src/types.js'

function event(overrides: Partial<AgentEvent>): AgentEvent {
  return {
    id: 'evt_1',
    type: 'tool.start',
    sessionId: 'session_1',
    timestamp: 100,
    agent: 'builder',
    ...overrides,
  } as AgentEvent
}

test('normalizes task start as delegation start', () => {
  const normalized = normalizeAgentEvent({
    raw: event({
      id: 'delegate_1',
      type: 'tool.start',
      tool: 'task',
      input: { subagent_type: 'frontend-dev', description: 'Build UI' },
    }),
    runId: 'run_1',
    sequence: 4,
  })

  expect(normalized.kind).toBe('delegation.started')
  expect(normalized.agentInstanceId).toBe('session_1:builder')
  expect(normalized.payload.subagentType).toBe('frontend-dev')
  expect(normalized.payload.title).toBe('Build UI')
})

test('normalizes bash completion as command execution', () => {
  const normalized = normalizeAgentEvent({
    raw: event({
      id: 'bash_1',
      type: 'tool.end',
      tool: 'bash',
      duration: 1200,
      output: 'ok',
    }),
    runId: 'run_1',
    sequence: 5,
  })

  expect(normalized.kind).toBe('command.executed')
  expect(normalized.payload.duration).toBe(1200)
  expect(normalized.payload.output).toBe('ok')
})

test('normalizes write and edit as file changes', () => {
  const write = normalizeAgentEvent({
    raw: event({
      id: 'write_1',
      type: 'tool.start',
      tool: 'write',
      input: { filePath: 'src/server.ts' },
    }),
    runId: 'run_1',
    sequence: 6,
  })

  expect(write.kind).toBe('file.changed')
  expect(write.payload.filePath).toBe('src/server.ts')
})

test('normalizes session error as error detected', () => {
  const normalized = normalizeAgentEvent({
    raw: event({
      id: 'error_1',
      type: 'session.error',
      tool: undefined,
      error: 'failed',
    }),
    runId: 'run_1',
    sequence: 7,
  })

  expect(normalized.kind).toBe('error.detected')
  expect(normalized.payload.error).toBe('failed')
})
