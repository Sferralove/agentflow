# Agent Flow Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Real-time React dashboard embedded in agent-flow-plugin showing flow graph and event timeline for a single session.

**Architecture:** Express + WebSocket server inside plugin broadcasts events to React frontend built with Vite. Plugin hooks call `broadcast(event)` after storing. Dashboard consumes events via WebSocket and renders reactflow canvas + scroll timeline.

**Tech Stack:** TypeScript, Express, ws, React 19, Vite 6, @xyflow/react, Tailwind CSS v4

---

### Task 1: Add server dependencies to plugin

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add runtime and dev dependencies**

```bash
npm install express ws
npm install -D @types/express @types/ws
```

- [ ] **Step 2: Verify package.json has new dependencies**

Run: `node -e "const p = require('./package.json'); console.log(p.dependencies.express, p.dependencies.ws, p.devDependencies['@types/express'], p.devDependencies['@types/ws'])"`

Expected: prints version strings for all four.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add express and ws dependencies for dashboard server"
```

---

### Task 2: Update plugin types for server config and broadcast

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: Add DashboardConfig and EventBroadcaster types**

Add to `src/types.ts` after the `Logger` interface:

```typescript
export interface DashboardConfig {
  port: number;
  host: string;
  autoOpen: boolean;
}

export type EventBroadcaster = (event: AgentEvent) => void;
```

- [ ] **Step 2: Build verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): add DashboardConfig and EventBroadcaster types"
```

---

### Task 3: Create plugin HTTP + WebSocket server

**Files:**
- Create: `src/server.ts`

- [ ] **Step 1: Write the server module**

Create `src/server.ts`:

```typescript
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import type { AgentEvent, DashboardConfig } from './types.js';
import type { PluginStore } from './store/index.js';

export class DashboardServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private subscriptions = new Map<WebSocket, string>();
  private store: PluginStore;
  private config: DashboardConfig;

  constructor(store: PluginStore, config: DashboardConfig) {
    this.store = store;
    this.config = config;

    this.app = express();

    // API: list sessions
    this.app.get('/api/sessions', (_req, res) => {
      res.json({ sessions: this.store.getSessions() });
    });

    // API: get events for a session
    this.app.get('/api/events/:sessionId', (req, res) => {
      res.json({ events: this.store.getEvents(req.params.sessionId) });
    });
  }

  /** Serve static dashboard build from given path */
  serveStatic(dashboardPath: string): void {
    if (!fs.existsSync(dashboardPath)) return;
    this.app.use(express.static(dashboardPath));
    // SPA fallback
    this.app.get('*', (_req, res) => {
      const indexPath = path.join(dashboardPath, 'index.html');
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.status(404).send('Dashboard not built. Run: cd dashboard && npm run build');
    });
  }

  /** Start the server */
  start(): void {
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws: WebSocket) => {
      // Send initial session list
      ws.send(JSON.stringify({ type: 'sessionList', sessions: this.store.getSessions() }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && typeof msg.sessionId === 'string') {
            this.subscriptions.set(ws, msg.sessionId);
          } else if (msg.type === 'requestSessions') {
            ws.send(JSON.stringify({ type: 'sessionList', sessions: this.store.getSessions() }));
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.subscriptions.delete(ws);
      });
    });

    this.server.listen(this.config.port, this.config.host, () => {
      console.log(`[agent-flow] Dashboard: http://${this.config.host}:${this.config.port}`);
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[agent-flow] Port ${this.config.port} in use. Dashboard unavailable.`);
      } else {
        console.error('[agent-flow] Server error:', err.message);
      }
    });
  }

  /** Broadcast event to clients subscribed to matching sessionId */
  broadcast(event: AgentEvent): void {
    if (!this.wss) return;
    const data = JSON.stringify({ type: 'event', event });
    for (const [ws, sessionId] of this.subscriptions) {
      if (ws.readyState === WebSocket.OPEN && sessionId === event.sessionId) {
        ws.send(data);
      }
    }
  }
}
```

- [ ] **Step 2: Build verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/server.ts
git commit -m "feat: add DashboardServer with express + ws + broadcast"
```

---

### Task 4: Modify plugin hooks to broadcast events

**Files:**
- Modify: `src/hooks/session.ts`
- Modify: `src/hooks/tool.ts`
- Modify: `src/hooks/message.ts`

- [ ] **Step 1: Update session.ts — add broadcast parameter**

Change `createSessionHook` signature to accept optional third parameter:

```typescript
import type { AgentEvent, EventBroadcaster } from '../types.js';

export function createSessionHook(
  store: PluginStore,
  container: PluginContainer,
  broadcast?: EventBroadcaster
) {
```

After each `await store.addEvent(event)` call, add `broadcast?.(event)`. Three places:

1. In `session.created`, after `await store.addEvent(event)` (line 27):
```typescript
      await store.addEvent(event);
      broadcast?.(event);
```

2. In `session.idle`, after `await store.addEvent(event)` (line 45):
```typescript
      await store.addEvent(event);
      broadcast?.(event);
```

3. In `session.error`, after `await store.addEvent(event)` (line 65):
```typescript
      await store.addEvent(event);
      broadcast?.(event);
```

- [ ] **Step 2: Update tool.ts — add broadcast parameter**

Change `createToolHooks` signature and add `import type { EventBroadcaster }`:

```typescript
import type { AgentEvent, EventBroadcaster } from '../types.js';

export function createToolHooks(
  store: PluginStore,
  container: PluginContainer,
  broadcast?: EventBroadcaster
) {
```

Add `broadcast?.(event)` after each `await store.addEvent(event)` call:

1. In `tool.execute.before`, after line 59 `await store.addEvent(event)`:
```typescript
      await store.addEvent(event);
      broadcast?.(event);
```

2. After `await store.addEvent(dispatchEvent)` on line 76:
```typescript
          await store.addEvent(dispatchEvent);
          broadcast?.(dispatchEvent);
```

3. After `await store.addEvent(skillEvent)` on line 95:
```typescript
          await store.addEvent(skillEvent);
          broadcast?.(skillEvent);
```

4. In `tool.execute.after`, after `await store.addEvent(event)` on line 128 and 143:
```typescript
        await store.addEvent(event);
        broadcast?.(event);
```

- [ ] **Step 3: Update message.ts — add broadcast parameter**

Change `createMessageHooks` signature and import:

```typescript
import type { AgentEvent, EventBroadcaster } from '../types.js';

export function createMessageHooks(
  store: PluginStore,
  container: PluginContainer,
  broadcast?: EventBroadcaster
) {
```

After `await store.addEvent(event)` on line 35:
```typescript
      await store.addEvent(event);
      broadcast?.(event);
```

- [ ] **Step 4: Build verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/session.ts src/hooks/tool.ts src/hooks/message.ts
git commit -m "feat(hooks): add broadcast parameter for real-time dashboard events"
```

---

### Task 5: Wire server into plugin entry point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update index.ts to create and start server**

Replace entire `src/index.ts`:

```typescript
/**
 * Agent Flow Plugin — automatic OpenCode monitoring
 *
 * Hooks into OpenCode events to capture ALL agent activity without
 * requiring explicit cooperation from agents. Writes to .agent-flow/data/.
 * Starts dashboard server at configured port.
 *
 * Usage:
 *   1. Add "agent-flow-plugin" to opencode.json plugin array
 *   2. Everything auto-logged — agents don't need to know
 */
import fs from 'fs';
import path from 'path';
import type { Logger, DashboardConfig } from './types.js';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';
import { DashboardServer } from './server.js';

const DEFAULT_CONFIG: DashboardConfig = {
  port: 3001,
  host: 'localhost',
  autoOpen: false,
};

function loadConfig(directory: string): DashboardConfig {
  const configPath = path.join(directory, '.agent-flow', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...DEFAULT_CONFIG, ...(raw.dashboard || {}) };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

export const AgentFlowPlugin = async ({
  directory,
  logger,
}: {
  directory: string;
  logger?: Logger;
}) => {
  const store = new PluginStore(directory);
  const container = new PluginContainer();
  const log = logger ?? console;
  const config = loadConfig(directory);

  // Dashboard server
  const server = new DashboardServer(store, config);
  const broadcast = (event: import('./types.js').AgentEvent) => server.broadcast(event);

  // Dashboard static files path
  const dashboardPath = path.join(directory, 'dist', 'dashboard');
  server.serveStatic(dashboardPath);

  const sessionHooks = createSessionHook(store, container, broadcast);
  const toolHooks = createToolHooks(store, container, broadcast);
  const messageHooks = createMessageHooks(store, container, broadcast);
  const tools = createTools(store);

  // Start server (non-blocking)
  server.start();

  log.info('[agent-flow] Plugin loaded — monitoring all activity');
  log.info(`[agent-flow] Data directory: ${directory}/.agent-flow/data/`);

  return {
    ...sessionHooks,
    ...toolHooks,
    ...messageHooks,
    tool: tools,
  };
};
```

- [ ] **Step 2: Build verify**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire DashboardServer into plugin entry point"
```

---

### Task 6: Run existing tests to verify no regressions

**Files:**
- (no changes, verify only)

- [ ] **Step 1: Run test suite**

```bash
npm test
```

Expected: all 39 tests pass. If any test fails due to the new broadcast parameter, fix by updating the test to pass `undefined` as third argument.

- [ ] **Step 2: Fix any failing tests**

If tests fail, update test files to pass `undefined` as third argument to factory functions. Example fix in `src/hooks/session.test.ts`:

Change:
```typescript
const hooks = createSessionHook(store, container);
```
To:
```typescript
const hooks = createSessionHook(store, container, undefined);
```

Same pattern for `tool.test.ts` and `message.test.ts`.

- [ ] **Step 3: Verify all tests pass**

```bash
npm test
```

Expected: 39 passing.

- [ ] **Step 4: Commit (if test fixes were needed)**

```bash
git add src/hooks/*.test.ts
git commit -m "test: update hooks tests for broadcast parameter"
```

---

### Task 7: Scaffold dashboard React + Vite project

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/tsconfig.json`
- Create: `dashboard/vite.config.ts`
- Create: `dashboard/index.html`
- Create: `dashboard/src/main.tsx`
- Create: `dashboard/src/types.ts`

- [ ] **Step 1: Create directory and package.json**

```bash
mkdir -p dashboard/src/components dashboard/src/hooks
```

Create `dashboard/package.json`:

```json
{
  "name": "agent-flow-dashboard",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@xyflow/react": "^12.9.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.4.0",
    "tailwindcss": "^4.1.0",
    "typescript": "~5.8.0",
    "vite": "^6.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

Create `dashboard/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

Create `dashboard/vite.config.ts`:

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
  build: {
    outDir: '../dist/dashboard',
    emptyOutDir: true,
  },
});
```

- [ ] **Step 4: Create index.html**

Create `dashboard/index.html`:

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Agent Flow Dashboard</title>
  </head>
  <body class="bg-gray-950 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create shared types for dashboard**

Create `dashboard/src/types.ts`:

```typescript
export type EventType = 'start' | 'complete' | 'dispatch' | 'task' | 'error' | 'message';

export interface AgentEvent {
  id: string;
  sessionId: string;
  type: EventType;
  agent: string;
  targetAgent?: string;
  payload: {
    action?: string;
    description?: string;
    duration?: number;
    args?: Record<string, unknown>;
    result?: string;
    error?: unknown;
    reason?: string;
    messageId?: string;
    contentLength?: number;
  };
  timestamp: number;
}

export interface WSMessage {
  type: 'event' | 'sessionList';
  event?: AgentEvent;
  sessions?: string[];
}
```

- [ ] **Step 6: Create main.tsx entry**

Create `dashboard/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 7: Install dependencies and build**

```bash
cd dashboard && npm install && npm run build
```

Expected: build succeeds, `dist/dashboard/` created with static files.

- [ ] **Step 8: Commit**

```bash
git add dashboard/
git commit -m "feat: scaffold React + Vite + Tailwind dashboard project"
```

---

### Task 8: Create WebSocket hook for dashboard

**Files:**
- Create: `dashboard/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Write useWebSocket hook**

Create `dashboard/src/hooks/useWebSocket.ts`:

```typescript
import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentEvent, WSMessage } from '../types';

interface UseWebSocketReturn {
  events: AgentEvent[];
  sessions: string[];
  connected: boolean;
  subscribe: (sessionId: string) => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [sessions, setSessions] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}`);

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (e) => {
      try {
        const msg: WSMessage = JSON.parse(e.data);
        if (msg.type === 'sessionList' && msg.sessions) {
          setSessions(msg.sessions);
        }
        if (msg.type === 'event' && msg.event) {
          setEvents(prev => [...prev, { ...msg.event!, timestamp: msg.event!.timestamp || Date.now() }]);
        }
      } catch {}
    };

    wsRef.current = ws;

    return () => {
      ws.close();
    };
  }, []);

  const subscribe = useCallback((sessionId: string) => {
    setEvents([]);
    wsRef.current?.send(JSON.stringify({ type: 'subscribe', sessionId }));
  }, []);

  return { events, sessions, connected, subscribe };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/hooks/useWebSocket.ts
git commit -m "feat(dashboard): add useWebSocket hook for real-time events"
```

---

### Task 9: Create App shell with layout

**Files:**
- Create: `dashboard/src/App.tsx`

- [ ] **Step 1: Write App component**

Create `dashboard/src/App.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import type { AgentEvent } from './types';
import StatsBar from './components/StatsBar';
import SessionSelector from './components/SessionSelector';
import Timeline from './components/Timeline';
import FlowGraph from './components/FlowGraph';

function getSessionFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('session') || null;
}

export default function App() {
  const { events, sessions, connected, subscribe } = useWebSocket();
  const [selectedSession, setSelectedSession] = useState<string | null>(getSessionFromUrl);

  // Filter events by selected session
  const filteredEvents = useMemo(() => {
    if (!selectedSession) return events;
    return events.filter(e => e.sessionId === selectedSession);
  }, [events, selectedSession]);

  // Create a keyed set of sessionIds from incoming events for the dropdown
  const availableSessions = useMemo(() => {
    const set = new Set(sessions);
    events.forEach(e => set.add(e.sessionId));
    return Array.from(set).sort().reverse();
  }, [sessions, events]);

  // Auto-select latest session if none selected
  useEffect(() => {
    if (!selectedSession && availableSessions.length > 0) {
      const latest = availableSessions[0];
      setSelectedSession(latest);
      subscribe(latest);
      window.history.replaceState(null, '', `?session=${latest}`);
    }
  }, [selectedSession, availableSessions, subscribe]);

  const handleSessionChange = (sessionId: string) => {
    setSelectedSession(sessionId);
    subscribe(sessionId);
    window.history.replaceState(null, '', `?session=${sessionId}`);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100 overflow-hidden font-mono">
      <header className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-bold tracking-wide text-emerald-400">AGENT FLOW</h1>
          <SessionSelector
            sessions={availableSessions}
            selected={selectedSession}
            onChange={handleSessionChange}
          />
        </div>
        <StatsBar events={filteredEvents} connected={connected} />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <Timeline events={filteredEvents} />
        <FlowGraph events={filteredEvents} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles (will have missing component errors until next tasks)**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | head -20
```

Expected: errors only for missing StatsBar, SessionSelector, Timeline, FlowGraph. No other errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/App.tsx
git commit -m "feat(dashboard): add App shell with layout and session routing"
```

---

### Task 10: Create StatsBar and SessionSelector

**Files:**
- Create: `dashboard/src/components/StatsBar.tsx`
- Create: `dashboard/src/components/SessionSelector.tsx`

- [ ] **Step 1: Write StatsBar component**

Create `dashboard/src/components/StatsBar.tsx`:

```tsx
import { useMemo } from 'react';
import type { AgentEvent } from '../types';

interface StatsBarProps {
  events: AgentEvent[];
  connected: boolean;
}

export default function StatsBar({ events, connected }: StatsBarProps) {
  const stats = useMemo(() => {
    const errors = events.filter(e => e.type === 'error').length;
    const first = events[0]?.timestamp || 0;
    const last = events[events.length - 1]?.timestamp || 0;
    const elapsed = last - first;
    const seconds = Math.floor(elapsed / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return { total: events.length, errors, elapsed: `${mins}m ${secs}s`, first };
  }, [events]);

  return (
    <div className="flex items-center gap-4 text-xs text-gray-400">
      <span>
        Events: <span className="text-gray-200 font-semibold">{stats.total}</span>
      </span>
      {stats.errors > 0 && (
        <span>
          Errors: <span className="text-red-400 font-semibold">{stats.errors}</span>
        </span>
      )}
      {stats.first > 0 && (
        <span>
          Duration: <span className="text-gray-200">{stats.elapsed}</span>
        </span>
      )}
      <span className="flex items-center gap-1">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-500'}`} />
        {connected ? 'live' : 'offline'}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Write SessionSelector component**

Create `dashboard/src/components/SessionSelector.tsx`:

```tsx
interface SessionSelectorProps {
  sessions: string[];
  selected: string | null;
  onChange: (sessionId: string) => void;
}

export default function SessionSelector({ sessions, selected, onChange }: SessionSelectorProps) {
  if (sessions.length === 0) return null;

  return (
    <select
      value={selected || ''}
      onChange={e => onChange(e.target.value)}
      className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200
                 focus:outline-none focus:border-emerald-500 cursor-pointer"
    >
      {sessions.map(s => (
        <option key={s} value={s}>
          {s.replace('session-', '').slice(0, 8)}...
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd dashboard && npx tsc --noEmit
```

Expected: only missing Timeline and FlowGraph errors remain.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/StatsBar.tsx dashboard/src/components/SessionSelector.tsx
git commit -m "feat(dashboard): add StatsBar and SessionSelector components"
```

---

### Task 11: Create Timeline and EventRow

**Files:**
- Create: `dashboard/src/components/Timeline.tsx`
- Create: `dashboard/src/components/EventRow.tsx`

- [ ] **Step 1: Write EventRow component**

Create `dashboard/src/components/EventRow.tsx`:

```tsx
import type { AgentEvent } from '../types';

const TYPE_COLORS: Record<string, string> = {
  start: 'border-emerald-500 text-emerald-400',
  complete: 'border-blue-500 text-blue-400',
  dispatch: 'border-purple-500 text-purple-400',
  task: 'border-yellow-500 text-yellow-400',
  error: 'border-red-500 text-red-400',
  message: 'border-gray-500 text-gray-400',
};

const TYPE_ICONS: Record<string, string> = {
  start: '▶',
  complete: '✓',
  dispatch: '↗',
  task: '●',
  error: '✕',
  message: '💬',
};

export default function EventRow({ event }: { event: AgentEvent }) {
  const color = TYPE_COLORS[event.type] || 'border-gray-600 text-gray-500';
  const icon = TYPE_ICONS[event.type] || '·';
  const time = new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false });
  const desc = event.payload?.description || event.payload?.action || event.type;

  return (
    <div className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${color} hover:bg-gray-800/50 
                     transition-colors text-xs flex-shrink-0`}>
      <span className="text-gray-500 w-16 shrink-0">{time}</span>
      <span className="w-4 shrink-0">{icon}</span>
      <span className="text-gray-300 w-20 shrink-0 font-semibold">{event.agent}</span>
      <span className={`${color.split(' ')[1]} truncate`}>
        {desc.length > 60 ? desc.slice(0, 60) + '…' : desc}
      </span>
      {event.targetAgent && (
        <span className="text-purple-400 ml-auto shrink-0">→ {event.targetAgent}</span>
      )}
      {event.payload?.duration != null && (
        <span className="text-gray-600 ml-auto shrink-0">{event.payload.duration}ms</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Write Timeline component**

Create `dashboard/src/components/Timeline.tsx`:

```tsx
import { useRef, useEffect } from 'react';
import type { AgentEvent } from '../types';
import EventRow from './EventRow';

export default function Timeline({ events }: { events: AgentEvent[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);

  const sorted = [...events].reverse(); // newest at top

  return (
    <div className="w-[320px] shrink-0 border-r border-gray-800 flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider
                      border-b border-gray-800 shrink-0">
        Timeline
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="p-4 text-xs text-gray-600 text-center">
            Waiting for events...
          </div>
        )}
        {sorted.map(event => (
          <EventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd dashboard && npx tsc --noEmit
```

Expected: only missing FlowGraph error remains.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/components/Timeline.tsx dashboard/src/components/EventRow.tsx
git commit -m "feat(dashboard): add Timeline with EventRow components"
```

---

### Task 12: Create FlowGraph with reactflow

**Files:**
- Create: `dashboard/src/components/FlowGraph.tsx`
- Create: `dashboard/src/components/AgentNode.tsx`

- [ ] **Step 1: Write AgentNode custom node**

Create `dashboard/src/components/AgentNode.tsx`:

```tsx
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface AgentNodeData {
  label: string;
  eventCount: number;
  errorCount: number;
  isActive: boolean;
}

function AgentNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as AgentNodeData;
  return (
    <div className={`
      px-3 py-2 rounded-lg border-2 shadow-lg text-xs font-mono
      transition-all duration-300 min-w-[100px] text-center
      ${nodeData.isActive
        ? 'border-emerald-500 bg-emerald-950/60 text-emerald-300 shadow-emerald-500/20'
        : 'border-gray-700 bg-gray-900 text-gray-300'
      }
    `}>
      <Handle type="target" position={Position.Top} className="!bg-gray-600" />
      <div className="font-bold text-sm">{nodeData.label}</div>
      <div className="flex justify-center gap-2 mt-1">
        <span className="text-gray-500">{nodeData.eventCount} events</span>
        {nodeData.errorCount > 0 && (
          <span className="text-red-400">{nodeData.errorCount} err</span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-600" />
    </div>
  );
}

export default memo(AgentNodeComponent);
```

- [ ] **Step 2: Write FlowGraph component**

Create `dashboard/src/components/FlowGraph.tsx`:

```tsx
import { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { AgentEvent } from '../types';
import AgentNode from './AgentNode';

const nodeTypes = { agentNode: AgentNode };

function buildGraph(events: AgentEvent[]): { nodes: Node[]; edges: Edge[] } {
  const agentCounts = new Map<string, { total: number; errors: number; lastTs: number }>();
  const dispatchEdges = new Map<string, { source: string; target: string; count: number }>();

  for (const event of events) {
    // Count per agent
    const stats = agentCounts.get(event.agent) || { total: 0, errors: 0, lastTs: 0 };
    stats.total++;
    if (event.type === 'error') stats.errors++;
    if (event.timestamp > stats.lastTs) stats.lastTs = event.timestamp;
    agentCounts.set(event.agent, stats);

    // Build dispatch edges
    if (event.type === 'dispatch' && event.targetAgent) {
      const key = `${event.agent}->${event.targetAgent}`;
      const existing = dispatchEdges.get(key);
      if (existing) {
        existing.count++;
      } else {
        dispatchEdges.set(key, { source: event.agent, target: event.targetAgent, count: 1 });
      }
    }
  }

  // Layout nodes in a grid
  const agents = Array.from(agentCounts.entries());
  const now = Date.now();
  const cols = Math.ceil(Math.sqrt(agents.length));
  const nodes: Node[] = agents.map(([agent, stats], i) => ({
    id: agent,
    type: 'agentNode',
    position: {
      x: (i % cols) * 180 + 50,
      y: Math.floor(i / cols) * 100 + 50,
    },
    data: {
      label: agent,
      eventCount: stats.total,
      errorCount: stats.errors,
      isActive: (now - stats.lastTs) < 5000, // active in last 5s
    },
  }));

  // Build edges
  let edgeId = 0;
  const edges: Edge[] = Array.from(dispatchEdges.values()).map(e => ({
    id: `e${edgeId++}`,
    source: e.source,
    target: e.target,
    animated: true,
    style: { stroke: '#a855f7', strokeWidth: 1 + e.count },
    label: `${e.count} dispatch${e.count > 1 ? 'es' : ''}`,
    labelStyle: { fill: '#a855f7', fontSize: 10 },
  }));

  return { nodes, edges };
}

export default function FlowGraph({ events }: { events: AgentEvent[] }) {
  const graph = useMemo(() => buildGraph(events), [events]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graph.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges);

  // Rebuild when graph changes
  const prevKey = useMemo(() => events.length, [events.length]);
  // Force re-render on new events by using key
  const reactFlowKey = `flow-${prevKey}`;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider
                      border-b border-gray-800 shrink-0">
        Flow Graph
      </div>
      <div className="flex-1">
        <ReactFlow
          key={reactFlowKey}
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          className="bg-gray-950"
        >
          <Background color="#1f2937" gap={20} />
          <Controls className="!bg-gray-900 !border-gray-700 !text-gray-300" />
          <MiniMap
            nodeColor={(n) => (n.data as any)?.isActive ? '#10b981' : '#374151'}
            maskColor="rgba(0,0,0,0.7)"
            className="!bg-gray-900 !border-gray-700"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript and build**

```bash
cd dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Build dashboard**

```bash
cd dashboard && npm run build
```

Expected: successful build.

- [ ] **Step 5: Commit**

```bash
git add dashboard/src/components/FlowGraph.tsx dashboard/src/components/AgentNode.tsx
git commit -m "feat(dashboard): add FlowGraph with reactflow agent nodes and dispatch edges"
```

---

### Task 13: Add build scripts and integration

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Add dashboard build scripts to root package.json**

Add these scripts to the `scripts` block:

```json
"build:dashboard": "cd dashboard && npm run build",
"dev:dashboard": "cd dashboard && npm run dev"
```

And update the existing `build` script to include dashboard:

```json
"build": "tsc -p tsconfig.json && cd dashboard && npm run build"
```

- [ ] **Step 2: Update .gitignore for dashboard dist**

Check and update `.gitignore`:

```bash
echo "dashboard/node_modules/" >> .gitignore 2>/dev/null || true
echo "dist/dashboard/" >> .gitignore 2>/dev/null || true
```

- [ ] **Step 3: Full build**

```bash
npm run build
```

Expected: plugin compiles, dashboard builds, `dist/dashboard/` created.

- [ ] **Step 4: Verify dist structure**

```bash
ls dist/dashboard/index.html && echo "OK: dashboard build in dist"
```

Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "build: add dashboard build scripts and full build pipeline"
```

---

### Task 14: End-to-end verification

**Files:**
- (no new files)

- [ ] **Step 1: Run all plugin tests**

```bash
npm test
```

Expected: 39 tests pass.

- [ ] **Step 2: Verify dashboard TypeScript**

```bash
cd dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Full production build**

```bash
npm run build
```

Expected: both plugin and dashboard build successfully.

- [ ] **Step 4: Verify final file structure**

```bash
echo "=== Plugin dist ===" && ls dist/ && echo "=== Dashboard dist ===" && ls dist/dashboard/ | head -5 && echo "=== Dashboard source ===" && ls dashboard/src/components/ && echo "=== All OK ==="
```

Expected: shows all files present.

- [ ] **Step 5: Commit**

```bash
git add .
git commit -m "chore: final verification, all builds pass"
```
