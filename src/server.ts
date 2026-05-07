// src/server.ts
// Bun HTTP server — watches JSONL files, serves SSE + REST API
// 0 runtime dependencies. Bun APIs only.

import type { Server } from 'bun'
import type { AgentEvent, SessionGraph } from './types.js'
import { applyEventToGraph, buildGraphFromEvents } from './trace/graphProjector.js'
import { createTraceProjector } from './trace/traceProjector.js'
import { createRunStore } from './run/runStore.js'
import { createSseHub } from './stream/sseHub.js'
import { readdirSync, readFileSync, existsSync } from 'node:fs'

export { applyEventToGraph, buildGraphFromEvents } from './trace/graphProjector.js'

const SESSIONS_DIR = '.agentflow/sessions'
const PID_FILE = '.agentflow/pid'
const DASHBOARD_DIR = new URL('../dashboard/dist', import.meta.url).pathname

// In-memory graph cache: sessionId → graph
const graphs = new Map<string, SessionGraph>()
// Active SSE clients: sessionId → Set<ReadableStreamController>
const clients = new Map<string, Set<ReadableStreamDefaultController>>()

// Trace engine
const traceProjector = createTraceProjector()
const runStore = createRunStore('.agentflow')
const sseHub = createSseHub()

// ─── Event Processing ───

export function classifySessions(eventsBySession: Record<string, AgentEvent[]>): Array<{ id: string; type: 'parent' | 'child' }> {
  return Object.entries(eventsBySession)
    .map(([id, events]) => {
      const hasDelegation = events.some(event => (
        event.type === 'tool.start' &&
        event.tool === 'task' &&
        Boolean(event.input?.subagent_type)
      ))
      const firstTimestamp = events.reduce(
        (min, event) => Math.min(min, event.timestamp),
        Number.POSITIVE_INFINITY,
      )
      return {
        id,
        type: hasDelegation ? 'parent' as const : 'child' as const,
        firstTimestamp: Number.isFinite(firstTimestamp) ? firstTimestamp : 0,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'parent' ? -1 : 1
      return a.firstTimestamp - b.firstTimestamp || a.id.localeCompare(b.id)
    })
    .map(({ id, type }) => ({ id, type }))
}

function processEvent(evt: AgentEvent): void {
  let graph = graphs.get(evt.sessionId)
  if (!graph) {
    graph = { nodes: [], edges: [] }
    graphs.set(evt.sessionId, graph)
  }

  applyEventToGraph(graph, evt)
}

// ─── SSE Broadcast ───

function broadcast(sessionId: string, data: string): void {
  const sessionClients = clients.get(sessionId)
  if (!sessionClients) return
  for (const ctrl of sessionClients) {
    try { ctrl.enqueue(`data: ${data}\n\n`) } catch { /* client disconnected */ }
  }
}

function addClient(sessionId: string, controller: ReadableStreamDefaultController): void {
  if (!clients.has(sessionId)) clients.set(sessionId, new Set())
  clients.get(sessionId)!.add(controller)
}

function removeClient(sessionId: string, controller: ReadableStreamDefaultController): void {
  clients.get(sessionId)?.delete(controller)
  if (clients.get(sessionId)?.size === 0) clients.delete(sessionId)
}

// ─── Path Sanitization ───

function sanitizeSessionId(id: string): string {
  // Allow only alphanumeric, dash, underscore. Max 128 chars.
  return id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128)
}

function sanitizeFilePath(path: string): string {
  // Remove path traversal sequences
  return path.replace(/\.\./g, '').replace(/\/+/g, '/').replace(/[^a-zA-Z0-9_./-]/g, '')
}

// ─── File Watcher (polling, 500ms) ───

let fileWatcher: ReturnType<typeof setInterval> | null = null
const readOffsets = new Map<string, number>() // file → last read position

async function readEventsFromFile(sessionId: string, since: number = 0): Promise<AgentEvent[]> {
  try {
    const text = await Bun.file(`${SESSIONS_DIR}/${sessionId}.jsonl`).text()
    return text.trim().split('\n')
      .filter(l => l.trim())
      .map(l => JSON.parse(l))
      .filter((event: AgentEvent) => event.timestamp >= since)
  } catch {
    return []
  }
}

async function readEventsBySession(since: number = 0): Promise<Record<string, AgentEvent[]>> {
  const eventsBySession: Record<string, AgentEvent[]> = {}
  const files = readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.jsonl'))
  for (const name of files) {
    const sessionId = sanitizeSessionId(name.replace('.jsonl', ''))
    if (!sessionId) continue
    eventsBySession[sessionId] = await readEventsFromFile(sessionId, since)
  }
  return eventsBySession
}

function startWatching(): void {
  if (fileWatcher) return
  fileWatcher = setInterval(() => {
    try {
      if (!existsSync(SESSIONS_DIR)) return
      const entries = readdirSync(SESSIONS_DIR)
      for (const name of entries) {
        if (!name.endsWith('.jsonl')) continue
        const fullPath = `${SESSIONS_DIR}/${name}`
        const sessionId = sanitizeSessionId(name.replace('.jsonl', ''))
        if (!sessionId) continue

        // Read only new bytes since last check (tail)
        const size = Bun.file(fullPath).size
        const offset = readOffsets.get(name) || 0
        if (size <= offset) continue
        readOffsets.set(name, size)

        // Read from offset to end
        try {
          const fd = readFileSync(fullPath, 'utf-8')
          const newContent = fd.slice(offset)
          const lines = newContent.trim().split('\n')

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const evt: AgentEvent = JSON.parse(line)
              processEvent(evt)
              broadcast(sessionId, line)

              const projection = traceProjector.applyRawEvent(evt)
              runStore.writeActiveRun(projection.snapshot.run).catch(() => {})
              runStore.writeSnapshot(projection.snapshot).catch(() => {})
              runStore.appendPatches(projection.patches).catch(() => {})
              sseHub.publish(projection.patches)
            } catch { /* skip malformed */ }
          }
        } catch { /* file read error */ }
      }
    } catch { /* session dir might not exist yet */ }
  }, 500)
}

// ─── HTTP Handler ───

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // CORS
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  // Health check
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ status: 'ok', clients: clients.size, sessions: graphs.size }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Run-first APIs
  if (url.pathname === '/api/runs/current') {
    const snapshot = traceProjector.getSnapshot()
    if (!snapshot) {
      return new Response(JSON.stringify({ run: null }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    return new Response(JSON.stringify(snapshot), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/snapshot')) {
    const runId = sanitizeSessionId(url.pathname.replace('/api/runs/', '').replace('/snapshot', ''))
    const snapshot = await runStore.readSnapshot(runId)
    return new Response(JSON.stringify(snapshot || { run: null }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  if (url.pathname === '/api/runs') {
    const snapshot = traceProjector.getSnapshot()
    return new Response(JSON.stringify({
      runs: snapshot ? [snapshot.run] : [],
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // SSE stream endpoint
  if (url.pathname === '/api/stream') {
    const runParam = url.searchParams.get('run')
    if (runParam) {
      const after = parseInt(url.searchParams.get('after') || '0', 10)
      const resolvedRunId = runParam === 'current' ? null : sanitizeSessionId(runParam)
      if (runParam !== 'current' && !resolvedRunId) {
        return new Response('Invalid run param', { status: 400, headers: corsHeaders })
      }

      const stream = new ReadableStream({
        start(controller) {
          let pollTimer: ReturnType<typeof setInterval> | null = null

          const tryConnect = (): boolean => {
            const snapshot = traceProjector.getSnapshot()
            const runId = runParam === 'current' ? snapshot?.run.id : resolvedRunId
            if (!runId) return false

            sseHub.addClient(runId, controller)
            sseHub.replay(runId, Number.isFinite(after) ? after : 0, controller)
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
            return true
          }

          if (!tryConnect() && runParam === 'current') {
            // No run yet — poll until one appears
            pollTimer = setInterval(tryConnect, 500)
          }
        },
        cancel(controller) {
          const snapshot = traceProjector.getSnapshot()
          const runId = runParam === 'current' ? snapshot?.run.id : resolvedRunId
          if (runId) sseHub.removeClient(runId, controller)
        },
      })

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...corsHeaders,
        },
      })
    }

    const raw = url.searchParams.get('session')
    if (!raw) return new Response('Missing session param', { status: 400, headers: corsHeaders })
    const sessionId = sanitizeSessionId(raw)
    if (!sessionId) return new Response('Invalid session param', { status: 400, headers: corsHeaders })

    const stream = new ReadableStream({
      start(controller) {
          addClient(sessionId, controller)

          // Replay: send all existing events for this session
          const replayFile = `${SESSIONS_DIR}/${sessionId}.jsonl`
          const file = Bun.file(replayFile)
          file.text().then(text => {
            const lines = text.trim().split('\n')
            for (const line of lines) {
              if (!line.trim()) continue
              try {
                processEvent(JSON.parse(line))
                controller.enqueue(`data: ${line}\n\n`)
              } catch { /* skip */ }
            }
          }).catch(() => {})
        },
        cancel(controller) {
          removeClient(sessionId, controller)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        ...corsHeaders,
      },
    })
  }

  // GET events for session with optional since + tree mode
  if (url.pathname === '/api/events') {
    const raw = url.searchParams.get('session')
    if (!raw) return new Response('Missing session param', { status: 400, headers: corsHeaders })
    const sessionId = sanitizeSessionId(raw)
    if (!sessionId) return new Response('Invalid session param', { status: 400, headers: corsHeaders })
    const since = parseInt(url.searchParams.get('since') || '0', 10)
    const tree = url.searchParams.get('tree') === 'true'

    try {
      let allEvents: AgentEvent[] = []

      if (tree) {
        // Merge events from ALL sessions for unified timeline
        const eventsBySession = await readEventsBySession(since)
        allEvents = Object.values(eventsBySession).flat()
      } else {
        allEvents = await readEventsFromFile(sessionId, since)
      }

      // Sort merged events by timestamp
      allEvents.sort((a, b) => a.timestamp - b.timestamp)

      return new Response(JSON.stringify(allEvents), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    } catch {
      return new Response('[]', { headers: { 'Content-Type': 'application/json', ...corsHeaders } })
    }
  }

  // GET agent graph for session
  if (url.pathname.startsWith('/api/agents/')) {
    const raw = url.pathname.replace('/api/agents/', '')
    const sessionId = sanitizeSessionId(raw)
    if (!sessionId) return new Response('Invalid session param', { status: 400, headers: corsHeaders })
    const tree = url.searchParams.get('tree') === 'true'
    const graph = tree
      ? buildGraphFromEvents(Object.values(await readEventsBySession()).flat())
      : graphs.get(sessionId)
    return new Response(JSON.stringify(graph || { nodes: [], edges: [] }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // GET list of available sessions
  if (url.pathname === '/api/sessions') {
    try {
      const sessions = classifySessions(await readEventsBySession())

      return new Response(JSON.stringify({ sessions }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    } catch {
      return new Response(JSON.stringify({ sessions: [] }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
  }

  // Serve dashboard static files
  try {
    let filePath = url.pathname === '/' ? '/index.html' : sanitizeFilePath(url.pathname)
    if (!filePath) throw new Error('Invalid path')
    if (!filePath.startsWith('/')) filePath = '/' + filePath
    const file = Bun.file(`${DASHBOARD_DIR}${filePath}`)
    if (await file.exists()) {
      const ext = filePath.split('.').pop()
      const mimeMap: Record<string, string> = {
        html: 'text/html', js: 'application/javascript', css: 'text/css',
        svg: 'image/svg+xml', json: 'application/json',
      }
      return new Response(file, {
        headers: { 'Content-Type': mimeMap[ext || ''] || 'text/plain', ...corsHeaders },
      })
    }
  } catch { /* fall through */ }

  return new Response('Not Found', { status: 404, headers: corsHeaders })
}

// ─── Start / Stop ───

let server: Server<any> | null = null

export function startServer(port: number = 3001): void {
  server = Bun.serve({
    port,
    fetch: handleRequest,
    idleTimeout: 0, // disable timeout for long-lived SSE connections
  })
  console.log(`[agentflow] Server started on http://localhost:${port}`)

  // Write PID
  Bun.write(PID_FILE, String(process.pid))

  // Ensure sessions directory exists
  try { Bun.spawnSync(['mkdir', '-p', SESSIONS_DIR]) } catch {}

  startWatching()
}

export function stopServer(): void {
  fileWatcher && clearInterval(fileWatcher)
  fileWatcher = null
  server?.stop()
  server = null
  console.log('[agentflow] Server stopped')
}
