// src/plugin.ts
// AgentFlow v2 plugin — hooks OpenCode, writes JSONL events
// 0 runtime dependencies. Bun APIs only.

import type { Plugin } from "@opencode-ai/plugin"
import type { FileSink } from "bun"

const LOG_DIR = '.agentflow/sessions'
const TOOLS_TRACKED = new Set(['task', 'write', 'edit', 'bash'])
const MAX_WRITERS = 50
const FLUSH_DEBOUNCE_MS = 250

// Keep a persistent writer per session to append JSONL lines efficiently
const writers = new Map<string, FileSink>()
// Debounce flush timers — one pending timer per session
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>()
// Track tool call start times for duration computation (keyed by sessionId:tool)
const startTimes = new Map<string, number>()
// Guard against duplicate shutdown handler registration
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
    || (raw.tool as string)
    || 'unknown'
}

function generateId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function makeStartTimeKey(sessionId: string, tool: string): string {
  return `${sessionId}:${tool}`
}

/** Flush a single session's writer. Silently drops errors. */
async function flushWriter(sid: string): Promise<void> {
  const writer = writers.get(sid)
  if (!writer) return
  try {
    await writer.flush()
  } catch {
    // Silently drop flush errors
  }
}

/** Schedule a debounced flush for a session. Resets on each call. */
function scheduleFlush(sid: string): void {
  const existing = flushTimers.get(sid)
  if (existing) clearTimeout(existing)
  flushTimers.set(sid, setTimeout(async () => {
    flushTimers.delete(sid)
    await flushWriter(sid)
  }, FLUSH_DEBOUNCE_MS))
}

/** Flush and close all writers. Used during shutdown. */
async function flushAllWriters(): Promise<void> {
  // Cancel any pending debounced flushes
  for (const [sid, timer] of flushTimers) {
    clearTimeout(timer)
  }
  flushTimers.clear()

  for (const [sid, writer] of writers) {
    try {
      await writer.flush()
      writer.end()
    } catch {
      // Silently drop errors during shutdown
    }
  }
  writers.clear()
}

/** Evict the oldest writer when the map exceeds MAX_WRITERS. */
function evictOldestWriter(): void {
  if (writers.size < MAX_WRITERS) return
  const oldestSid = writers.keys().next().value
  if (!oldestSid) return

  const writer = writers.get(oldestSid)
  if (writer) {
    try {
      writer.flush() // fire-and-forget
      writer.end()
    } catch {
      // Silently drop
    }
  }
  writers.delete(oldestSid)

  // Clean up any pending timer for the evicted session
  const timer = flushTimers.get(oldestSid)
  if (timer) {
    clearTimeout(timer)
    flushTimers.delete(oldestSid)
  }
}

async function writeEvent(evt: Record<string, unknown>): Promise<void> {
  const sid = evt.sessionId as string
  if (sid === 'unknown') return
  try {
    let writer = writers.get(sid)
    if (!writer) {
      // Evict oldest before creating new writer to bound FD usage
      evictOldestWriter()
      writer = Bun.file(`${LOG_DIR}/${sid}.jsonl`).writer()
      writers.set(sid, writer)
    }
    // Await write to prevent interleaved JSONL lines on rapid concurrent writes
    await writer.write(JSON.stringify(evt) + '\n')
    // Debounced flush — batches nearby writes for perf, ensures data lands on disk
    scheduleFlush(sid)
  } catch {
    // Silently drop write errors (e.g. directory missing, permissions)
  }
}

/** Register process-wide shutdown handlers to flush + close all writers. */
function registerShutdownHandlers(): void {
  if (cleanupRegistered) return
  cleanupRegistered = true

  const shutdown = async () => {
    await flushAllWriters()
  }

  process.on('beforeExit', shutdown)

  // Signal handlers: best-effort cleanup because FileSink.end() flushes buffers
  process.on('SIGINT', () => {
    // Fire-and-forget flush, then exit
    flushAllWriters().finally(() => process.exit(0))
  })
  process.on('SIGTERM', () => {
    flushAllWriters().finally(() => process.exit(0))
  })
}
registerShutdownHandlers()

export const AgentFlowPlugin: Plugin = async ({ directory }) => ({
  "tool.execute.before": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    const raw = input as Record<string, unknown>
    const sid = extractSessionId(raw)

    // Track start time so after hook can compute real duration
    startTimes.set(makeStartTimeKey(sid, tool), Date.now())

    await writeEvent({
      type: 'tool.start',
      id: generateId(),
      sessionId: sid,
      timestamp: Date.now(),
      agent: extractAgent(raw),
      tool,
      input: tool === 'task'
        ? {
            subagent_type: output.args?.subagent_type,
            description: output.args?.description,
          }
        : {
            ...output.args,
            // Truncate long command/description to avoid huge JSONL lines
            command: output.args?.command?.slice(0, 500),
            description: output.args?.description?.slice(0, 200),
          },
    })
  },

  "tool.execute.after": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    const raw = input as Record<string, unknown>
    const sid = extractSessionId(raw)

    // Compute duration from locally tracked start time instead of output.duration
    // (output.duration is not guaranteed by the typed plugin contract)
    const key = makeStartTimeKey(sid, tool)
    const started = startTimes.get(key)
    startTimes.delete(key)
    const duration: number | undefined = started ? Date.now() - started : undefined

    await writeEvent({
      type: 'tool.end',
      id: generateId(),
      sessionId: sid,
      timestamp: Date.now(),
      agent: extractAgent(raw),
      tool,
      duration,
      output: typeof output.result === 'string' ? output.result.slice(0, 1000) : output.result,
      // Fallback chain: output.error (standard) or output.metadata?.error (alternative path)
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
