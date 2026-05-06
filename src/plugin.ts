// src/plugin.ts
// AgentFlow v2 plugin — hooks OpenCode, writes JSONL events
// 0 runtime dependencies. Bun APIs only.

import type { Plugin } from "@opencode-ai/plugin"
import type { FileSink } from "bun"
import { ToolTimer } from './toolTiming.js'

const LOG_DIR = '.agentflow/sessions'
const TOOLS_TRACKED = new Set(['task', 'write', 'edit', 'bash'])
const MAX_WRITERS = 50
const FLUSH_DEBOUNCE_MS = 250

const writers = new Map<string, FileSink>()
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()
const toolTimer = new ToolTimer()
let cleanupRegistered = false

function extractSessionId(raw: Record<string, unknown>): string {
  const props = raw.properties as Record<string, unknown> | undefined
  const session = raw.session as Record<string, unknown> | undefined
  return (raw.sessionId as string)
    || (raw.sessionID as string)
    || (session?.id as string)
    || (props?.sessionId as string)
    || (props?.sessionID as string)
    || 'unknown'
}

function extractAgent(raw: Record<string, unknown>): string {
  const props = raw.properties as Record<string, unknown> | undefined
  const info = props?.info as Record<string, unknown> | undefined
  return (raw.agent as string)
    || (info?.agent as string)
    || 'builder'
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function extractToolCallId(...records: Array<Record<string, unknown> | undefined>): string | undefined {
  const keys = ['id', 'callId', 'callID', 'toolCallId', 'toolCallID', 'invocationId']
  for (const record of records) {
    if (!record) continue
    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value) return value
    }
    const props = asRecord(record.properties)
    const nested = extractToolCallId(props, asRecord(record.metadata))
    if (nested) return nested
  }
  return undefined
}

async function flushWriter(sid: string): Promise<void> {
  const writer = writers.get(sid)
  if (!writer) return
  try { await writer.flush() } catch {}
}

function scheduleFlush(sid: string): void {
  const existing = flushTimers.get(sid)
  if (existing) clearTimeout(existing)
  flushTimers.set(sid, setTimeout(async () => {
    flushTimers.delete(sid)
    await flushWriter(sid)
  }, FLUSH_DEBOUNCE_MS))
}

async function flushAllWriters(): Promise<void> {
  for (const [sid, timer] of flushTimers) clearTimeout(timer)
  flushTimers.clear()
  for (const [, writer] of writers) {
    try { await writer.flush(); writer.end() } catch {}
  }
  writers.clear()
}

function evictOldestWriter(): void {
  if (writers.size < MAX_WRITERS) return
  const oldestSid = writers.keys().next().value
  if (!oldestSid) return
  const writer = writers.get(oldestSid)
  if (writer) { try { writer.flush(); writer.end() } catch {} }
  writers.delete(oldestSid)
  const timer = flushTimers.get(oldestSid)
  if (timer) { clearTimeout(timer); flushTimers.delete(oldestSid) }
}

async function writeEvent(evt: Record<string, unknown>): Promise<void> {
  const sid = evt.sessionId as string
  if (sid === 'unknown') return
  try {
    let writer = writers.get(sid)
    if (!writer) {
      evictOldestWriter()
      writer = Bun.file(`${LOG_DIR}/${sid}.jsonl`).writer()
      writers.set(sid, writer)
    }
    await writer.write(JSON.stringify(evt) + '\n')
    scheduleFlush(sid)
  } catch {}
}

function registerShutdownHandlers(): void {
  if (cleanupRegistered) return
  cleanupRegistered = true
  process.on('beforeExit', flushAllWriters)
  process.on('SIGINT', () => { flushAllWriters().finally(() => process.exit(0)) })
  process.on('SIGTERM', () => { flushAllWriters().finally(() => process.exit(0)) })
}
registerShutdownHandlers()

export const server: Plugin = async ({ directory }) => ({
  "tool.execute.before": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    const raw = input as Record<string, unknown>
    const sid = extractSessionId(raw)
    const now = Date.now()
    toolTimer.start(sid, tool, extractToolCallId(raw, asRecord(output)), now)

    await writeEvent({
      type: 'tool.start',
      id: generateId(),
      sessionId: sid,
      timestamp: now,
      agent: extractAgent(raw),
      tool,
      input: tool === 'task'
        ? { subagent_type: output.args?.subagent_type, description: output.args?.description }
        : { ...output.args, command: output.args?.command?.slice(0, 500), description: output.args?.description?.slice(0, 200) },
    })
  },

  "tool.execute.after": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    const raw = input as Record<string, unknown>
    const sid = extractSessionId(raw)
    const now = Date.now()
    const duration = toolTimer.end(sid, tool, extractToolCallId(raw, asRecord(output)), now)

    await writeEvent({
      type: 'tool.end',
      id: generateId(),
      sessionId: sid,
      timestamp: now,
      agent: extractAgent(raw),
      tool,
      duration,
      output: typeof output.result === 'string' ? output.result.slice(0, 1000) : output.result,
      error: output.error || output.metadata?.error || null,
    })
  },

  event: async ({ event }: { event: Record<string, unknown> }) => {
    const type = event.type as string
    if (!type || !type.startsWith('session.')) return

    const payload: Record<string, unknown> = {
      type,
      id: generateId(),
      sessionId: extractSessionId(event),
      timestamp: Date.now(),
      agent: extractAgent(event),
    }
    if (type === 'session.error') payload.error = event.error
    await writeEvent(payload)
  },
})

/** @deprecated use `server` instead — kept for backward compat with tests */
export const AgentFlowPlugin = server
