// src/server.ts
// Bun HTTP server — watches JSONL files, serves SSE + REST API
// 0 runtime dependencies. Bun APIs only.

import type { Server } from 'bun'
import type { AgentEvent, SessionGraph, AgentNode, AgentEdge } from './types.js'
import { readdirSync, readFileSync, existsSync } from 'node:fs'

const SESSIONS_DIR = '.agentflow/sessions'
const PID_FILE = '.agentflow/pid'
const DASHBOARD_DIR = new URL('../dashboard/dist', import.meta.url).pathname

// In-memory graph cache: sessionId → graph
const graphs = new Map<string, SessionGraph>()
// Active SSE clients: sessionId → Set<ReadableStreamController>
const clients = new Map<string, Set<ReadableStreamDefaultController>>()

// ─── Event Processing ───

function ensureNode(
  graph: SessionGraph,
  id: string,
  type: 'main' | 'subagent',
  parentId?: string,
  sessionId?: string,
  timestamp: number = Date.now(),
): AgentNode {
  let node = graph.nodes.find(n => n.id === id)
  if (!node) {
    node = {
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type,
      parentId,
      status: 'idle',
      sessionId: sessionId || graph.nodes[0]?.sessionId || '',
      startedAt: timestamp,
      lastSeenAt: timestamp,
      tasksCompleted: 0,
      tasksFailed: 0,
    }
    graph.nodes.push(node)
  } else {
    const wasSubagent = node.type === 'subagent'
    if (type === 'subagent') node.type = 'subagent'
    if (parentId && !node.parentId) node.parentId = parentId
    if (
      sessionId &&
      (
        node.sessionId === '' ||
        (wasSubagent && type === 'main' && node.sessionId !== sessionId)
      )
    ) {
      node.sessionId = sessionId
    }
    node.lastSeenAt = Math.max(node.lastSeenAt || node.startedAt, timestamp)
  }
  return node
}

function updateNodeStatus(graph: SessionGraph, id: string, status: AgentNode['status'], timestamp: number = Date.now()): void {
  const node = graph.nodes.find(n => n.id === id)
  if (!node) return
  node.status = status
  node.lastSeenAt = Math.max(node.lastSeenAt || node.startedAt, timestamp)
  if (status === 'completed' || status === 'error') {
    node.completedAt = timestamp
  }
}

export function applyEventToGraph(graph: SessionGraph, evt: AgentEvent): void {
  // Tool start: track task delegation
  if (evt.type === 'tool.start' && evt.tool === 'task' && evt.input) {
    const subagent = evt.input.subagent_type as string
    const description = (evt.input.description as string) || 'delegated task'
    if (!subagent) return

    ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    updateNodeStatus(graph, evt.agent, 'running', evt.timestamp)
    ensureNode(graph, subagent, 'subagent', evt.agent, evt.sessionId, evt.timestamp)
    updateNodeStatus(graph, subagent, 'running', evt.timestamp)

    if (!graph.edges.some(e => e.source === evt.agent && e.target === subagent)) {
      graph.edges.push({
        id: evt.id,
        source: evt.agent,
        target: subagent,
        description,
      })
    }
    return
  }

  if (evt.type === 'tool.start' && evt.tool) {
    ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    updateNodeStatus(graph, evt.agent, 'running', evt.timestamp)
    return
  }

  // Tool end: update emitting agent metrics. Delegation calls should not
  // complete the parent agent; session lifecycle events decide final state.
  if (evt.type === 'tool.end' && evt.tool === 'task') {
    const node = ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    if (evt.error) {
      node.tasksFailed++
      updateNodeStatus(graph, evt.agent, 'error', evt.timestamp)
    } else {
      node.tasksCompleted++
      if (node.status === 'idle') updateNodeStatus(graph, evt.agent, 'running', evt.timestamp)
    }
    return
  }

  if (evt.type === 'tool.end' && evt.tool) {
    const node = ensureNode(graph, evt.agent, 'main', undefined, evt.sessionId, evt.timestamp)
    if (evt.error) {
      node.tasksFailed++
      updateNodeStatus(graph, evt.agent, 'error', evt.timestamp)
    } else {
      node.tasksCompleted++
      updateNodeStatus(graph, evt.agent, 'completed', evt.timestamp)
    }
    return
  }

  // Session lifecycle
  if (evt.type === 'session.created') {
    ensureNode(graph, evt.agent || 'builder', 'main', undefined, evt.sessionId, evt.timestamp)
  }
  if (evt.type === 'session.error') {
    updateNodeStatus(graph, evt.agent || 'builder', 'error', evt.timestamp)
  }
  if (evt.type === 'session.compacted') {
    updateNodeStatus(graph, evt.agent || 'builder', 'compacted', evt.timestamp)
  }
  if (evt.type === 'session.idle') {
    if (evt.agent) updateNodeStatus(graph, evt.agent, 'completed', evt.timestamp)
  }
}

export function buildGraphFromEvents(events: AgentEvent[]): SessionGraph {
  const graph: SessionGraph = { nodes: [], edges: [] }
  for (const evt of events.slice().sort((a, b) => a.timestamp - b.timestamp)) {
    applyEventToGraph(graph, evt)
  }
  return graph
}

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

  // SSE stream endpoint
  if (url.pathname === '/api/stream') {
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
