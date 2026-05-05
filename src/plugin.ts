// src/plugin.ts
// AgentFlow v2 plugin — hooks OpenCode, writes JSONL events
// 0 runtime dependencies. Bun APIs only.

import type { Plugin } from "@opencode-ai/plugin"
import type { FileSink } from "bun"

const LOG_DIR = '.agentflow/sessions'
const TOOLS_TRACKED = new Set(['task', 'write', 'edit', 'bash'])

// Keep a persistent writer per session to append JSONL lines efficiently
const writers = new Map<string, FileSink>()

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

async function writeEvent(evt: Record<string, unknown>): Promise<void> {
  const sid = evt.sessionId as string
  if (sid === 'unknown') return
  try {
    let writer = writers.get(sid)
    if (!writer) {
      writer = Bun.file(`${LOG_DIR}/${sid}.jsonl`).writer()
      writers.set(sid, writer)
    }
    writer.write(JSON.stringify(evt) + '\n')
  } catch {
    // Silently drop write errors (e.g. directory missing, permissions)
  }
}

export const AgentFlowPlugin: Plugin = async ({ directory }) => ({
  "tool.execute.before": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    const raw = input as Record<string, unknown>
    await writeEvent({
      type: 'tool.start',
      id: generateId(),
      sessionId: extractSessionId(raw),
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
    await writeEvent({
      type: 'tool.end',
      id: generateId(),
      sessionId: extractSessionId(raw),
      timestamp: Date.now(),
      agent: extractAgent(raw),
      tool,
      duration: output.duration,
      output: typeof output.result === 'string' ? output.result.slice(0, 1000) : output.result,
      error: output.error || null,
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
