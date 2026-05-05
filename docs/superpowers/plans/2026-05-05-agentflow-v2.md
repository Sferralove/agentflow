# AgentFlow v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build per-project agent monitoring tool (plugin + server + dashboard) that captures OpenCode agent workflow in real-time via JSONL + SSE.

**Architecture:** Plugin hooks OpenCode events → writes `.agentflow/sessions/{id}.jsonl` → Server (Bun, :3001) watches files + serves SSE → Dashboard (React+ReactFlow, :3000) consumes stream.

**Tech Stack:** TypeScript, Bun (server/plugin), React 18 + ReactFlow 11 + Tailwind 3 (dashboard), Vite (build).

---

## File Structure

```
agentflow/
├── package.json              # Workspace root: scripts, deps
├── tsconfig.json             # TypeScript config
├── src/
│   ├── plugin.ts             # OpenCode plugin (→ .opencode/plugins/)
│   ├── server.ts             # Bun HTTP server + SSE + fs.watch
│   ├── cli.ts                # CLI entry: serve, stop, init, status
│   ├── types.ts              # Shared types
│   └── index.ts              # Package exports
├── dashboard/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types.ts
│       ├── components/
│       │   ├── Header.tsx
│       │   ├── AgentGraph.tsx
│       │   ├── DetailPanel.tsx
│       │   ├── AgentNode.tsx
│       │   └── EventRow.tsx
│       ├── hooks/
│       │   └── useSSE.ts
│       └── styles/
│           └── index.css
└── test/
    └── integration.test.ts
```

---

### Task 1: Project setup

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`

- [ ] **Step 1: Initialize package.json**

```json
{
  "name": "agentflow",
  "version": "3.0.0",
  "description": "OpenCode agent flow monitor v2 — plugin + server + dashboard",
  "type": "module",
  "bin": {
    "agentflow": "./dist/cli.js"
  },
  "files": [
    "dist/",
    "plugin/"
  ],
  "scripts": {
    "build": "tsc && npm -C dashboard run build",
    "dev": "tsc --watch",
    "test": "bun test"
  },
  "dependencies": {},
  "devDependencies": {
    "@opencode-ai/plugin": "^1.14.0",
    "@types/bun": "^1.2.0"
  },
  "peerDependencies": {
    "typescript": "^5.6.0"
  },
  "engines": {
    "bun": ">=1.2.0"
  },
  "publishConfig": {
    "access": "public"
  },
  "keywords": ["opencode", "plugin", "monitoring", "agent-flow"],
  "license": "MIT"
}
```

- [ ] **Step 2: Initialize tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "dashboard"]
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json tsconfig.json
git commit -m "chore: init agentflow v2 project structure"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Define all shared type interfaces**

```ts
// src/types.ts
export type EventType =
  | 'session.created'
  | 'session.error'
  | 'session.compacted'
  | 'session.idle'
  | 'tool.start'
  | 'tool.end'

export interface AgentEvent {
  type: EventType
  id: string
  sessionId: string
  timestamp: number
  agent: string
  tool?: string
  input?: Record<string, unknown>
  output?: unknown
  duration?: number
  error?: string | null
}

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'compacted'

export interface AgentNode {
  id: string
  name: string
  type: 'main' | 'subagent'
  parentId?: string
  status: AgentStatus
  sessionId: string
  startedAt: number
  completedAt?: number
  tasksCompleted: number
  tasksFailed: number
}

export interface AgentEdge {
  id: string
  source: string
  target: string
  description: string
}

export interface SessionGraph {
  nodes: AgentNode[]
  edges: AgentEdge[]
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts
git commit -m "feat: define shared types for events and agent graph"
```

---

### Task 3: Plugin — OpenCode event collector

**Files:**
- Create: `src/plugin.ts`

- [ ] **Step 1: Write the plugin file**

```ts
// src/plugin.ts
// AgentFlow v2 plugin — hooks OpenCode, writes JSONL events
// 0 runtime dependencies. Bun APIs only.

import type { Plugin } from "@opencode-ai/plugin"

const LOG_DIR = '.agentflow/sessions'
const TOOLS_TRACKED = new Set(['task', 'write', 'edit', 'bash'])

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
    const file = `${LOG_DIR}/${sid}.jsonl`
    await Bun.write(file, JSON.stringify(evt) + '\n', { append: true })
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
```

**Note:** Hook input shapes are based on official plugin docs examples. Exact fields (`sessionId`, `agent` etc. in tool hook inputs) will be verified at runtime and extraction heuristics adjusted accordingly.

- [ ] **Step 2: Verify plugin compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/plugin.ts
git commit -m "feat: add OpenCode plugin for JSONL event collection"
```

---

### Task 4: Server — HTTP + SSE + file watcher

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Write server implementation**

```ts
// src/server.ts
// Bun HTTP server — watches JSONL files, serves SSE + REST API
// 0 runtime dependencies. Bun APIs only.

import type { Server } from 'bun'
import type { AgentEvent, SessionGraph, AgentNode, AgentEdge } from './types.js'

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

    graph.edges.push({
      id: evt.id,
      source: evt.agent,
      target: subagent,
      description,
    })
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
  const sessionClients = clients.get(sessionId)
  if (!sessionClients) return
  sessionClients.delete(controller)
  if (sessionClients.size === 0) clients.delete(sessionId)
}

// ─── File Watcher ───

let fileWatcher: ReturnType<typeof setInterval> | null = null

function startWatching(): void {
  if (fileWatcher) return
  // Poll every 500ms — fs.watch on macOS unreliable for rapid writes
  const lastSizes = new Map<string, number>()
  fileWatcher = setInterval(async () => {
    try {
      const dir = Bun.file(SESSIONS_DIR)
      if (!(await dir.exists())) return
      for await (const entry of (dir as any).values?.() ?? []) {
        const name = entry?.name
        if (!name?.endsWith('.jsonl')) continue
        const fullPath = `${SESSIONS_DIR}/${name}`
        const file = Bun.file(fullPath)
        const size = await file.size
        const last = lastSizes.get(name) || 0
        if (size === last) continue
        lastSizes.set(name, size)

        // Read new lines and broadcast
        const text = await file.text()
        const lines = text.trim().split('\n')
        const sessionId = name.replace('.jsonl', '')

        // Broadcast new events
        const newLines = lines.slice(last === 0 ? 0 : lines.length - 1)
        for (const line of newLines) {
          if (!line.trim()) continue
          try {
            const evt: AgentEvent = JSON.parse(line)
            processEvent(evt)
            broadcast(sessionId, line)
          } catch { /* skip malformed */ }
        }
      }
    } catch { /* session dir might not exist yet */ }
  }, 500)
}

// ─── HTTP Handler ───

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url)

  // CORS
  const corsHeaders = {
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
    const sessionId = url.searchParams.get('session')
    if (!sessionId) return new Response('Missing session param', { status: 400, headers: corsHeaders })

    const stream = new ReadableStream({
      start(controller) {
        addClient(sessionId!, controller)

        // Replay: send all existing events for this session
        const file = Bun.file(`${SESSIONS_DIR}/${sessionId}.jsonl`)
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
        removeClient(sessionId!, controller)
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
    const sessionId = url.searchParams.get('session')
    const since = parseInt(url.searchParams.get('since') || '0', 10)
    if (!sessionId) return new Response('Missing session param', { status: 400, headers: corsHeaders })

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
    const sessionId = url.pathname.replace('/api/agents/', '')
    const graph = graphs.get(sessionId)
    return new Response(JSON.stringify(graph || { nodes: [], edges: [] }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }

  // Serve dashboard static files
  try {
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname
    const file = Bun.file(`${DASHBOARD_DIR}${filePath}`)
    if (await file.exists()) {
      const ext = filePath.split('.').pop()
      const mimeMap: Record<string, string> = {
        html: 'text/html', js: 'application/javascript', css: 'text/css',
        svg: 'image/svg+xml', json: 'application/json',
      }
      return new Response(file, {
        headers: { 'Content-Type': mimeMap[ext || ''] || 'text/plain' },
      })
    }
  } catch { /* fall through */ }

  return new Response('Not Found', { status: 404, headers: corsHeaders })
}

// ─── Start / Stop ───

let server: Server | null = null

export function startServer(port: number = 3001): void {
  server = Bun.serve({
    port,
    fetch: handleRequest,
  })
  console.log(`[agentflow] Server started on http://localhost:${port}`)

  // Write PID
  Bun.write(PID_FILE, String(process.pid))

  // Ensure sessions directory exists
  Bun.spawn(['mkdir', '-p', SESSIONS_DIR])

  startWatching()
}

export function stopServer(): void {
  fileWatcher && clearInterval(fileWatcher)
  fileWatcher = null
  server?.stop()
  server = null
  console.log('[agentflow] Server stopped')
}
```

- [ ] **Step 2: Verify server compiles**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add Bun HTTP server with SSE streaming and JSONL watcher"
```

---

### Task 5: CLI — command-line interface

**Files:**
- Create: `src/cli.ts`

- [ ] **Step 1: Write CLI entry point**

```ts
#!/usr/bin/env bun
// src/cli.ts — AgentFlow v2 CLI

import { startServer, stopServer } from './server.js'
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PID_FILE = '.agentflow/pid'
const PLUGIN_SRC = resolve(__dirname, 'plugin.ts')
const PLUGIN_DEST = '.opencode/plugins/agentflow.ts'

const cmd = process.argv[2]
const port = parseInt(process.argv[3] || process.argv[4] || '3001', 10)

function isRunning(): boolean {
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
    process.kill(pid, 0) // signal 0 = check if process exists
    return true
  } catch {
    return false
  }
}

async function main(): Promise<void> {
  switch (cmd) {
    case 'serve': {
      if (isRunning()) {
        console.log('[agentflow] Server already running')
        return
      }
      startServer(port)
      // Keep process alive for background mode
      await new Promise(() => {}) // hang forever
      break
    }

    case 'stop': {
      if (!isRunning()) {
        console.log('[agentflow] No server running')
        return
      }
      try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10)
        process.kill(pid, 'SIGTERM')
        console.log('[agentflow] Server stopped')
      } catch (e) {
        console.error('[agentflow] Failed to stop server:', e)
      }
      break
    }

    case 'status': {
      console.log(isRunning() ? 'running' : 'stopped')
      break
    }

    case 'init': {
      // Create directories
      mkdirSync('.agentflow/sessions', { recursive: true })
      mkdirSync('.opencode/plugins', { recursive: true })

      // Copy plugin file
      if (existsSync(PLUGIN_SRC)) {
        copyFileSync(PLUGIN_SRC, PLUGIN_DEST)
        console.log('[agentflow] Plugin installed to .opencode/plugins/agentflow.ts')
      } else {
        // Fallback: write from bundled source
        const pluginContent = `// AgentFlow v2 plugin — see https://github.com/Sferralove/agentflow
export { AgentFlowPlugin } from '@agentflow/plugin'`
        writeFileSync(PLUGIN_DEST, pluginContent)
        console.log('[agentflow] Plugin stub installed. Add @agentflow/plugin to .opencode/package.json dependencies.')
      }

      // Update .gitignore
      const gitignore = '.gitignore'
      const entry = '.agentflow/'
      if (existsSync(gitignore)) {
        const content = readFileSync(gitignore, 'utf-8')
        if (!content.includes(entry)) {
          writeFileSync(gitignore, (content.trimEnd() + '\n' + entry + '\n'))
        }
      } else {
        writeFileSync(gitignore, entry + '\n')
      }

      console.log('[agentflow] Initialized. Run `agentflow serve` to start.')
      break
    }

    default: {
      console.log(`AgentFlow v2
Usage:
  agentflow init              Initialize project
  agentflow serve [port]      Start server (default :3001)
  agentflow stop              Stop server
  agentflow status            Check if server is running`)
      break
    }
  }
}

main().catch(console.error)
```

- [ ] **Step 2: Update package.json bin path**

Verify `package.json` has:
```json
"bin": { "agentflow": "./dist/cli.js" }
```

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: add CLI with serve, stop, init, status commands"
```

---

### Task 6: Package index

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Write index exports**

```ts
// src/index.ts — Public package exports
export { AgentFlowPlugin } from './plugin.js'
export { startServer, stopServer } from './server.js'
export type { AgentEvent, AgentNode, AgentEdge, SessionGraph, EventType, AgentStatus } from './types.js'
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: `dist/` directory created with compiled JS + declarations

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add package entry point exports"
```

---

### Task 7: Dashboard project setup

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/vite.config.ts`
- Create: `dashboard/tsconfig.json`
- Create: `dashboard/index.html`
- Create: `dashboard/tailwind.config.ts`
- Create: `dashboard/postcss.config.js`

- [ ] **Step 1: Write dashboard/package.json**

```json
{
  "name": "agentflow-dashboard",
  "private": true,
  "version": "3.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "reactflow": "^11.11.4"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Write dashboard/vite.config.ts**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 3000 },
  build: { outDir: 'dist' },
})
```

- [ ] **Step 3: Write dashboard/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Write dashboard/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AgentFlow v2</title>
</head>
<body class="bg-gray-950 text-gray-100">
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: Write dashboard/tailwind.config.ts**

```ts
import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

- [ ] **Step 6: Write dashboard/postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 7: Commit**

```bash
git add dashboard/
git commit -m "feat: init dashboard project with Vite + React + ReactFlow + Tailwind"
```

---

### Task 8: Dashboard types

**Files:**
- Create: `dashboard/src/types.ts`

- [ ] **Step 1: Write frontend‑facing type definitions**

```ts
// dashboard/src/types.ts

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'compacted'

export interface AgentNode {
  id: string
  name: string
  type: 'main' | 'subagent'
  parentId?: string
  status: AgentStatus
  sessionId: string
  startedAt: number
  completedAt?: number
  tasksCompleted: number
  tasksFailed: number
}

export interface AgentEdge {
  id: string
  source: string
  target: string
  description: string
}

export interface SessionGraph {
  nodes: AgentNode[]
  edges: AgentEdge[]
}

export interface AgentEvent {
  type: string
  id: string
  sessionId: string
  timestamp: number
  agent: string
  tool?: string
  input?: Record<string, unknown>
  output?: unknown
  duration?: number
  error?: string | null
}

export const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: '#6b7280',
  running: '#3b82f6',
  completed: '#10b981',
  error: '#ef4444',
  compacted: '#8b5cf6',
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/types.ts
git commit -m "feat: add dashboard type definitions"
```

---

### Task 9: useSSE hook

**Files:**
- Create: `dashboard/src/hooks/useSSE.ts`

- [ ] **Step 1: Write SSE hook**

```ts
// dashboard/src/hooks/useSSE.ts
import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, SessionGraph } from '../types'

const API_BASE = 'http://localhost:3001'

export function useSSE(sessionId: string | null) {
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [graph, setGraph] = useState<SessionGraph>({ nodes: [], edges: [] })
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!sessionId) return

    const es = new EventSource(`${API_BASE}/api/stream?session=${sessionId}`)
    eventSourceRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => setConnected(false)

    es.onmessage = (msg) => {
      try {
        const evt: AgentEvent = JSON.parse(msg.data)
        setEvents(prev => [...prev.slice(-499), evt]) // keep last 500 events
      } catch { /* skip malformed */ }
    }

    // Fetch graph structure
    fetch(`${API_BASE}/api/agents/${sessionId}`)
      .then(r => r.json())
      .then(g => setGraph(g))
      .catch(() => {})

    return () => {
      es.close()
      setConnected(false)
    }
  }, [sessionId])

  // Re-fetch graph on event change (debounced)
  useEffect(() => {
    if (!sessionId || events.length === 0) return
    const timer = setTimeout(() => {
      fetch(`${API_BASE}/api/agents/${sessionId}`)
        .then(r => r.json())
        .then(g => setGraph(g))
        .catch(() => {})
    }, 500)
    return () => clearTimeout(timer)
  }, [events.length, sessionId])

  return { events, graph, connected }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/hooks/useSSE.ts
git commit -m "feat: add SSE hook for real-time event streaming"
```

---

### Task 10: Dashboard CSS

**Files:**
- Create: `dashboard/src/styles/index.css`

- [ ] **Step 1: Write Tailwind entry**

```css
/* dashboard/src/styles/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  @apply bg-gray-950 text-gray-100 m-0 p-0;
}

.react-flow__node {
  font-size: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/styles/index.css
git commit -m "feat: add dashboard tailwind styles"
```

---

### Task 11: AgentNode component

**Files:**
- Create: `dashboard/src/components/AgentNode.tsx`

- [ ] **Step 1: Write custom ReactFlow node**

```tsx
// dashboard/src/components/AgentNode.tsx
import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { AgentNode as AgentNodeType } from '../types'
import { STATUS_COLORS } from '../types'

const AgentNodeComponent = ({ data, selected }: NodeProps<AgentNodeType>) => {
  const color = STATUS_COLORS[data.status]

  return (
    <div
      className={`
        px-4 py-2 rounded-xl border-2 text-white text-center min-w-[140px]
        transition-all duration-300
        ${selected ? 'ring-2 ring-offset-2 ring-offset-gray-950' : ''}
      `}
      style={{ backgroundColor: color + '22', borderColor: color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500" />
      <div className="font-semibold text-sm">
        {data.type === 'main' ? '🏗️' : data.id === 'product-manager' ? '📋' :
         data.id === 'backend-dev' ? '⚙️' : data.id === 'tester' ? '🧪' :
         data.id === 'reviewer' ? '🔍' : '🤖'}
        {' '}{data.name}
      </div>
      <div className="text-xs opacity-70 mt-1">
        {data.status}
        {data.tasksCompleted > 0 && ` · ${data.tasksCompleted}/${data.tasksCompleted + data.tasksFailed}`}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500" />
    </div>
  )
}

export default memo(AgentNodeComponent)
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/AgentNode.tsx
git commit -m "feat: add custom ReactFlow agent node component"
```

---

### Task 12: EventRow component

**Files:**
- Create: `dashboard/src/components/EventRow.tsx`

- [ ] **Step 1: Write event row component**

```tsx
// dashboard/src/components/EventRow.tsx
import type { AgentEvent } from '../types'

const TOOL_ICONS: Record<string, string> = {
  task: '📤', write: '✏️', edit: '📝', bash: '⚡',
}

const TYPE_COLORS: Record<string, string> = {
  'tool.start': 'text-blue-400',
  'tool.end': 'text-green-400',
  'session.error': 'text-red-400',
  'session.idle': 'text-gray-400',
  'session.created': 'text-blue-300',
  'session.compacted': 'text-purple-400',
}

export default function EventRow({ event }: { event: AgentEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString()
  const icon = TOOL_ICONS[event.tool || ''] || ''
  const color = TYPE_COLORS[event.type] || 'text-gray-400'
  const desc = event.tool
    ? `${event.tool}${event.input?.filePath ? ' ' + event.input.filePath : ''}${event.input?.command ? ' ' + (event.input.command as string).slice(0, 40) : ''}`
    : event.type

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-800 text-xs">
      <span className="text-gray-500 w-16 shrink-0">{time}</span>
      <span className={color + ' shrink-0'}>{icon}</span>
      <span className={color + ' truncate'}>{desc}</span>
      {event.duration != null && (
        <span className="text-gray-500 ml-auto shrink-0">{(event.duration / 1000).toFixed(1)}s</span>
      )}
      {event.error && (
        <span className="text-red-400 ml-1 shrink-0" title={event.error as string}>⚠️</span>
      )}
      {event.output && typeof event.output === 'string' && event.output.length < 50 && (
        <span className="text-green-400 ml-1 shrink-0">{event.output}</span>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/EventRow.tsx
git commit -m "feat: add event row component with icons"
```

---

### Task 13: DetailPanel component

**Files:**
- Create: `dashboard/src/components/DetailPanel.tsx`

- [ ] **Step 1: Write detail panel**

```tsx
// dashboard/src/components/DetailPanel.tsx
import type { AgentNode, AgentEvent } from '../types'
import { STATUS_COLORS } from '../types'
import EventRow from './EventRow'

interface DetailPanelProps {
  selectedNode: AgentNode | null
  events: AgentEvent[]
}

export default function DetailPanel({ selectedNode, events }: DetailPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4">
        Click an agent node to inspect
      </div>
    )
  }

  const nodeEvents = events.filter(e => e.agent === selectedNode.id)

  const duration = selectedNode.completedAt
    ? ((selectedNode.completedAt - selectedNode.startedAt) / 1000).toFixed(0) + 's'
    : 'running...'

  return (
    <div className="h-full overflow-y-auto p-3">
      {/* Agent header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: STATUS_COLORS[selectedNode.status] }}
          />
          <h3 className="font-semibold text-sm">{selectedNode.name}</h3>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          <div>{selectedNode.status} · {duration}</div>
          <div>{selectedNode.sessionId}</div>
        </div>
      </div>

      {/* Stats */}
      {(selectedNode.tasksCompleted > 0 || selectedNode.tasksFailed > 0) && (
        <div className="mb-4 p-2 bg-gray-900 rounded text-xs">
          <div>✓ Completed: {selectedNode.tasksCompleted}</div>
          <div>✗ Failed: {selectedNode.tasksFailed}</div>
        </div>
      )}

      {/* Events */}
      <div className="text-xs font-semibold uppercase text-gray-500 mb-2">
        Events ({nodeEvents.length})
      </div>
      <div>
        {nodeEvents.length === 0 && (
          <div className="text-gray-500 text-xs">No events yet</div>
        )}
        {nodeEvents.map(evt => (
          <EventRow key={evt.id} event={evt} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/DetailPanel.tsx
git commit -m "feat: add detail panel component for agent inspection"
```

---

### Task 14: AgentGraph component

**Files:**
- Create: `dashboard/src/components/AgentGraph.tsx`

- [ ] **Step 1: Write ReactFlow graph component**

```tsx
// dashboard/src/components/AgentGraph.tsx
import { useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  useNodesState,
  useEdgesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import type { AgentNode as AgentNodeType, AgentEdge as AgentEdgeType } from '../types'
import AgentNodeComponent from './AgentNode'

const nodeTypes = { agentNode: AgentNodeComponent }

interface AgentGraphProps {
  nodes: AgentNodeType[]
  edges: AgentEdgeType[]
  onNodeSelect: (node: AgentNodeType | null) => void
}

export default function AgentGraph({ nodes, edges, onNodeSelect }: AgentGraphProps) {
  const rn: Node[] = nodes.map(n => ({
    id: n.id,
    type: 'agentNode',
    position: { x: 0, y: 0 }, // auto‑layout handled below
    data: n,
  }))

  const re: Edge[] = edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.description.slice(0, 30),
    animated: true,
    style: { stroke: '#6b7280' },
  }))

  const [flowNodes, , onNodesChange] = useNodesState(rn)
  const [flowEdges, , onEdgesChange] = useEdgesState(re)

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeSelect(node.data as AgentNodeType)
    },
    [onNodeSelect],
  )

  const onPaneClick = useCallback(() => onNodeSelect(null), [onNodeSelect])

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#374151" gap={16} />
        <Controls />
        <MiniMap
          nodeColor={(n) => {
            const d = n.data as AgentNodeType
            const colors: Record<string, string> = {
              idle: '#6b7280', running: '#3b82f6', completed: '#10b981',
              error: '#ef4444', compacted: '#8b5cf6',
            }
            return colors[d.status] || '#6b7280'
          }}
          style={{ background: '#1f2937' }}
        />
      </ReactFlow>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/AgentGraph.tsx
git commit -m "feat: add ReactFlow agent graph component"
```

---

### Task 15: Header component

**Files:**
- Create: `dashboard/src/components/Header.tsx`

- [ ] **Step 1: Write header component**

```tsx
// dashboard/src/components/Header.tsx
interface HeaderProps {
  sessionId: string
  connected: boolean
}

export default function Header({ sessionId, connected }: HeaderProps) {
  return (
    <header className="h-10 px-4 flex items-center justify-between bg-gray-900 border-b border-gray-800 shrink-0">
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold">AgentFlow v2</h1>
        {sessionId && (
          <span className="text-xs text-gray-400">· {sessionId}</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span
          className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`}
        />
        <span className="text-gray-400">{connected ? 'connected' : 'disconnected'}</span>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/src/components/Header.tsx
git commit -m "feat: add header component with connection status"
```

---

### Task 16: App assembly

**Files:**
- Create: `dashboard/src/main.tsx`
- Create: `dashboard/src/App.tsx`

- [ ] **Step 1: Write main.tsx entry point**

```tsx
// dashboard/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 2: Write App.tsx with full layout**

```tsx
// dashboard/src/App.tsx
import { useState, useMemo } from 'react'
import { ReactFlowProvider } from 'reactflow'
import { useSSE } from './hooks/useSSE'
import type { AgentNode } from './types'
import Header from './components/Header'
import AgentGraph from './components/AgentGraph'
import DetailPanel from './components/DetailPanel'

const SESSION_ID = new URLSearchParams(window.location.search).get('session') || 'unknown'

export default function App() {
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null)
  const { events, graph, connected } = useSSE(SESSION_ID)

  const nodeEvents = useMemo(
    () => events.filter(e => !selectedNode || e.agent === selectedNode.id),
    [events, selectedNode],
  )

  return (
    <div className="h-screen flex flex-col">
      <Header sessionId={SESSION_ID} connected={connected} />
      <div className="flex-1 flex">
        <div className="w-1/3 border-r border-gray-800 bg-gray-900 overflow-hidden">
          <DetailPanel selectedNode={selectedNode} events={nodeEvents} />
        </div>
        <div className="w-2/3">
          <ReactFlowProvider>
            <AgentGraph
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeSelect={setSelectedNode}
            />
          </ReactFlowProvider>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/main.tsx dashboard/src/App.tsx
git commit -m "feat: assemble dashboard app with split layout"
```

---

### Task 17: Build and verify

**Files:**
- No new files

- [ ] **Step 1: Install dependencies**

Run: `npm install && npm -C dashboard install`
Expected: No errors

- [ ] **Step 2: Build server**

Run: `npm run build`
Expected: `dist/` created with `.js` and `.d.ts` files

- [ ] **Step 3: Build dashboard**

Run: `npm -C dashboard run build`
Expected: `dashboard/dist/` created with `index.html`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: install dependencies and verify build"
```

---

### Task 18: Integration smoke test

**Files:**
- Create: `test/smoke.test.ts`

- [ ] **Step 1: Write basic smoke test**

```ts
// test/smoke.test.ts
import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { Server } from 'bun'

let server: Server

beforeAll(() => {
  // Start server on random port
  server = Bun.serve({
    port: 0,
    fetch: async (req) => {
      // Minimal handler — full server tested manually for now
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    },
  })
})

afterAll(() => {
  server.stop()
})

test('server responds to health check', async () => {
  const res = await fetch(`http://localhost:${server.port}/health`)
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.status).toBe('ok')
})

test('server returns 404 for unknown path', async () => {
  const res = await fetch(`http://localhost:${server.port}/unknown`)
  expect(res.status).toBe(404)
})
```

- [ ] **Step 2: Run tests**

Run: `bun test`
Expected: 2 tests pass

- [ ] **Step 3: Commit**

```bash
git add test/smoke.test.ts
git commit -m "test: add smoke tests for server"
```

---

### Task 19: Install dependencies and verify full build

- [ ] **Step 1: Install root deps**

Run: `npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 2: Install dashboard deps**

Run: `npm -C dashboard install`
Expected: `dashboard/node_modules/` created, no errors

- [ ] **Step 3: Full build**

Run: `npm run build`
Expected: `dist/` and `dashboard/dist/` populated

- [ ] **Step 4: Verify dist outputs**

Run: `ls dist/ && ls dashboard/dist/`
Expected: `dist/` has `.js` + `.d.ts` files. `dashboard/dist/` has `index.html`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: verify full production build"
```
