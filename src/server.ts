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

function ensureNode(graph: SessionGraph, id: string, type: 'main' | 'subagent', parentId?: string): AgentNode {
  let node = graph.nodes.find(n => n.id === id)
  if (!node) {
    node = {
      id,
      name: id.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      type,
      parentId,
      status: 'idle',
      sessionId: graph.nodes[0]?.sessionId || '',
      startedAt: Date.now(),
      tasksCompleted: 0,
      tasksFailed: 0,
    }
    graph.nodes.push(node)
  }
  return node
}

function updateNodeStatus(graph: SessionGraph, id: string, status: AgentNode['status']): void {
  const node = graph.nodes.find(n => n.id === id)
  if (!node) return
  node.status = status
  if (status === 'completed' || status === 'error') {
    node.completedAt = Date.now()
  }
}

function processEvent(evt: AgentEvent): void {
  let graph = graphs.get(evt.sessionId)
  if (!graph) {
    graph = { nodes: [], edges: [] }
    graphs.set(evt.sessionId, graph)
  }

  // Tool start: track task delegation
  if (evt.type === 'tool.start' && evt.tool === 'task' && evt.input) {
    const subagent = evt.input.subagent_type as string
    const description = (evt.input.description as string) || 'delegated task'
    if (!subagent) return

    ensureNode(graph, evt.agent, 'main')
    ensureNode(graph, subagent, 'subagent', evt.agent)
    updateNodeStatus(graph, subagent, 'running')

    if (!graph.edges.some(e => e.source === evt.agent && e.target === subagent)) {
      graph.edges.push({
        id: evt.id,
        source: evt.agent,
        target: subagent,
        description,
      })
    }
  }

  // Tool end: update subagent status
  if (evt.type === 'tool.end' && evt.tool === 'task') {
    const status = evt.error ? 'error' : 'completed'
    updateNodeStatus(graph, evt.agent, status)
    const node = graph.nodes.find(n => n.id === evt.agent)
    if (node) {
      if (status === 'completed') node.tasksCompleted++
      else node.tasksFailed++
    }
  }

  // Session lifecycle
  if (evt.type === 'session.created') {
    ensureNode(graph, evt.agent || 'builder', 'main')
  }
  if (evt.type === 'session.error') {
    updateNodeStatus(graph, evt.agent || 'builder', 'error')
  }
  if (evt.type === 'session.compacted') {
    updateNodeStatus(graph, evt.agent || 'builder', 'compacted')
  }
  if (evt.type === 'session.idle') {
    if (evt.agent) updateNodeStatus(graph, evt.agent, 'completed')
  }
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

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

  // GET events for session with optional since filter
  if (url.pathname === '/api/events') {
    const raw = url.searchParams.get('session')
    if (!raw) return new Response('Missing session param', { status: 400, headers: corsHeaders })
    const sessionId = sanitizeSessionId(raw)
    if (!sessionId) return new Response('Invalid session param', { status: 400, headers: corsHeaders })
    const since = parseInt(url.searchParams.get('since') || '0', 10)

    try {
      const file = Bun.file(`${SESSIONS_DIR}/${sessionId}.jsonl`)
      const text = await file.text()
      const events = text.trim().split('\n')
        .filter(l => l.trim())
        .map(l => JSON.parse(l))
        .filter((e: AgentEvent) => e.timestamp >= since)
      return new Response(JSON.stringify(events), {
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
    const graph = graphs.get(sessionId)
    return new Response(JSON.stringify(graph || { nodes: [], edges: [] }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
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
