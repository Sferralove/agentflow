# Agent Flow Plugin — Production Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship production-ready v0.2.0 of agent-flow-plugin on npm

**Architecture:** Class-based PluginContainer replaces module-level mutable state. FIFO stack for in-flight tool tracking fixes race condition. All hooks receive container via constructor closure. Tests via node:test.

**Tech Stack:** TypeScript 5.6+, Node 18+, node:test (no test deps), GitHub Actions

---

### Task 1: Extract shared utility `generateId()`

**Files:**
- Create: `src/util/id.ts`
- Create: `src/util/id.test.ts`

- [ ] **1a: Create `src/util/id.ts`**

```typescript
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
```

- [ ] **1b: Create `src/util/id.test.ts`**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateId } from './id.js';

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    assert.equal(typeof id, 'string');
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    assert.equal(ids.size, 100);
  });

  it('is at least 8 chars', () => {
    assert.ok(generateId().length >= 8);
  });
});
```

- [ ] **1c: Run test to verify**

Run: `node --test src/util/id.test.ts`
Expected: All 3 tests pass

- [ ] **1d: Commit**

```bash
git add src/util/id.ts src/util/id.test.ts
git commit -m "feat: extract shared generateId utility"
```

---

### Task 2: Create PluginContainer class

**Files:**
- Create: `src/plugin-container.ts`

- [ ] **2a: Create `src/plugin-container.ts`**

```typescript
export class PluginContainer {
  sessionId: string | null = null;
  sessionStartedAt: number = 0;
  inFlight = new Map<string, Array<{ agent: string; startedAt: number }>>();
  loggedMessages = new Set<string>();
}
```

- [ ] **2b: Commit**

```bash
git add src/plugin-container.ts
git commit -m "feat: add PluginContainer for instance-level state"
```

---

### Task 3: Add Logger type to types

**Files:**
- Modify: `src/types.ts`

- [ ] **3a: Add Logger interface to `src/types.ts`**

Edit: Append after `PluginContext`:

```typescript
export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}
```

- [ ] **3b: Commit**

```bash
git add src/types.ts
git commit -m "feat: add Logger interface"
```

---

### Task 4: Refactor session hooks — use container

**Files:**
- Modify: `src/hooks/session.ts`

- [ ] **4a: Rewrite `src/hooks/session.ts`**

Replace entire file:

```typescript
import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

export function createSessionHook(store: PluginStore, container: PluginContainer) {
  return {
    'session.created': async (input: unknown) => {
      const inp = input as { session?: { id: string; title?: string } };
      container.sessionId = inp.session?.id || ('session-' + Date.now());
      container.sessionStartedAt = Date.now();

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'start',
        agent: 'opencode',
        payload: {
          action: inp.session?.title || 'new-session',
          description: 'Session started',
        },
        timestamp: container.sessionStartedAt,
      };

      await store.addEvent(event);
    },

    'session.idle': async () => {
      if (!container.sessionId) return;

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'complete',
        agent: 'opencode',
        payload: {
          action: 'session-complete',
          description: 'All work completed',
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
      container.sessionId = null;
    },

    'session.error': async (input: unknown) => {
      if (!container.sessionId) return;
      const inp = input as { error?: { message?: string } };

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'error',
        agent: 'opencode',
        payload: {
          description: inp.error?.message || 'Session error',
          error: inp.error,
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
    },
  };
}
```

- [ ] **4b: Commit**

```bash
git add src/hooks/session.ts
git commit -m "refactor: session hooks use PluginContainer"
```

---

### Task 5: Refactor tool hooks — use container + FIFO stack

**Files:**
- Modify: `src/hooks/tool.ts`

- [ ] **5a: Rewrite `src/hooks/tool.ts`**

Replace entire file with container-aware + FIFO-fixed version:

```typescript
import type { AgentEvent, Logger } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

function toolToAgent(tool: string, args?: Record<string, unknown>): string {
  if (args?.agent && typeof args.agent === 'string') return args.agent;

  const toolMap: Record<string, string> = {
    'task': 'delegator',
    'todowrite': 'delegator',
    'bash': 'shell',
    'read': 'reader',
    'write': 'writer',
    'edit': 'editor',
    'grep': 'searcher',
    'glob': 'finder',
    'webfetch': 'fetcher',
    'skill': 'skill-loader',
  };

  for (const [prefix, agent] of Object.entries(toolMap)) {
    if (tool.startsWith(prefix)) return agent;
  }

  return 'opencode';
}

interface ToolInput {
  tool: string;
  args?: Record<string, unknown>;
}

interface ToolOutput {
  result?: string;
  error?: string;
}

export function createToolHooks(store: PluginStore, container: PluginContainer, logger?: Logger) {
  const log = logger ?? console;

  return {
    'tool.execute.before': async (input: unknown) => {
      const inp = input as ToolInput;
      if (!container.sessionId) return;

      const agent = toolToAgent(inp.tool, inp.args);

      // Push onto FIFO stack for this tool type (handles concurrent executions)
      if (!container.inFlight.has(inp.tool)) {
        container.inFlight.set(inp.tool, []);
      }
      container.inFlight.get(inp.tool)!.push({ agent, startedAt: Date.now() });

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'task',
        agent,
        payload: {
          action: inp.tool,
          description: `Executing: ${inp.tool}`,
          args: inp.args || {},
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);

      // Detect task delegations
      if (inp.tool === 'task' || inp.tool === 'todowrite') {
        const subagent = inp.args?.subagent_type as string | undefined;
        if (subagent) {
          const dispatchEvent: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'dispatch',
            agent: 'opencode',
            targetAgent: subagent,
            payload: {
              reason: (inp.args?.description as string) || `Dispatch to ${subagent}`,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(dispatchEvent);
        }
      }

      // Detect skill loading
      if (inp.tool === 'skill') {
        const skillName = inp.args?.name as string | undefined;
        if (skillName && skillName !== 'agent-flow') {
          const skillEvent: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'message',
            agent: 'opencode',
            payload: {
              action: 'skill-loaded',
              description: `Loaded skill: ${skillName}`,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(skillEvent);
        }
      }
    },

    'tool.execute.after': async (input: unknown, output: unknown) => {
      const inp = input as ToolInput;
      const out = output as ToolOutput;
      if (!container.sessionId) return;

      // Pop from FIFO stack (shift = oldest first)
      const stack = container.inFlight.get(inp.tool);
      const flight = stack?.shift();
      if (stack?.length === 0) container.inFlight.delete(inp.tool);

      const agent = flight?.agent || toolToAgent(inp.tool, inp.args);
      const duration = flight ? Date.now() - flight.startedAt : 0;

      if (out?.error) {
        const event: AgentEvent = {
          id: generateId(),
          sessionId: container.sessionId,
          type: 'error',
          agent,
          payload: {
            action: inp.tool,
            description: out.error,
            duration,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
      } else {
        const event: AgentEvent = {
          id: generateId(),
          sessionId: container.sessionId,
          type: 'complete',
          agent,
          payload: {
            action: inp.tool,
            description: `Completed: ${inp.tool}`,
            duration,
            result: typeof out?.result === 'string' ? out.result.slice(0, 200) : undefined,
          },
          timestamp: Date.now(),
        };
        await store.addEvent(event);
      }
    },
  };
}
```

- [ ] **5b: Commit**

```bash
git add src/hooks/tool.ts
git commit -m "refactor: tool hooks use PluginContainer + FIFO stack"
```

---

### Task 6: Refactor message hooks — use container

**Files:**
- Modify: `src/hooks/message.ts`

- [ ] **6a: Rewrite `src/hooks/message.ts`**

```typescript
import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

interface MessageInput {
  message?: {
    id: string;
    role: string;
    content?: string;
  };
}

export function createMessageHooks(store: PluginStore, container: PluginContainer) {
  return {
    'message.updated': async (input: unknown) => {
      const inp = input as MessageInput;
      if (!container.sessionId || !inp.message) return;

      if (inp.message.role !== 'assistant') return;
      if (container.loggedMessages.has(inp.message.id)) return;
      container.loggedMessages.add(inp.message.id);

      const content = inp.message.content || '';
      const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'message',
        agent: 'opencode',
        payload: {
          action: 'response',
          description: preview,
          messageId: inp.message.id,
          contentLength: content.length,
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
    },
  };
}
```

- [ ] **6b: Commit**

```bash
git add src/hooks/message.ts
git commit -m "refactor: message hooks use PluginContainer"
```

---

### Task 7: Update plugin entry point — logger + container

**Files:**
- Modify: `src/index.ts`

- [ ] **7a: Rewrite `src/index.ts`**

```typescript
import type { Logger } from './types.js';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';

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

  const sessionHooks = createSessionHook(store, container);
  const toolHooks = createToolHooks(store, container, logger);
  const messageHooks = createMessageHooks(store, container);
  const tools = createTools(store);

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

- [ ] **7b: Commit**

```bash
git add src/index.ts
git commit -m "refactor: plugin accepts logger, uses PluginContainer"
```

---

### Task 8: Update tsconfig — outDir to dist

**Files:**
- Modify: `tsconfig.json`

- [ ] **8a: Change `outDir` in `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **8b: Commit**

```bash
git add tsconfig.json
git commit -m "build: output compiled JS to dist/"
```

---

### Task 9: Update package.json — metadata and paths

**Files:**
- Modify: `package.json`

- [ ] **9a: Update `package.json`**

```json
{
  "name": "agent-flow-plugin",
  "version": "0.2.0",
  "description": "OpenCode plugin for automatic agent flow monitoring — no agent cooperation needed",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "prepublishOnly": "npm run build",
    "test": "node --test src/**/*.test.ts",
    "lint": "eslint src/"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/your-org/agent-flow-plugin.git"
  },
  "bugs": {
    "url": "https://github.com/your-org/agent-flow-plugin/issues"
  },
  "homepage": "https://github.com/your-org/agent-flow-plugin#readme",
  "engines": {
    "node": ">=18"
  },
  "publishConfig": {
    "access": "public"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "*"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.6.0"
  },
  "keywords": ["opencode", "plugin", "monitoring", "agent-flow"],
  "license": "MIT"
}
```

Note: Update the repository URL to the actual repo.

- [ ] **9b: Commit**

```bash
git add package.json
git commit -m "chore: bump to 0.2.0, add npm metadata, update paths"
```

---

### Task 10: Add tests for all modules

**Files:**
- Create: `src/util/id.test.ts` (already done in Task 1)
- Create: `src/plugin-container.test.ts`
- Create: `src/store/index.test.ts`
- Create: `src/hooks/session.test.ts`
- Create: `src/hooks/tool.test.ts`
- Create: `src/hooks/message.test.ts`
- Create: `src/tools/index.test.ts`

- [ ] **10a: Create `src/plugin-container.test.ts`**

```typescript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PluginContainer } from '../plugin-container.js';

describe('PluginContainer', () => {
  it('starts with null sessionId', () => {
    const c = new PluginContainer();
    assert.equal(c.sessionId, null);
  });

  it('starts with empty inFlight map', () => {
    const c = new PluginContainer();
    assert.equal(c.inFlight.size, 0);
  });

  it('starts with empty loggedMessages set', () => {
    const c = new PluginContainer();
    assert.equal(c.loggedMessages.size, 0);
  });
});
```

- [ ] **10b: Create `src/store/index.test.ts`**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from './index.js';

describe('PluginStore', () => {
  let tmpDir: string;
  let store: PluginStore;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes and reads events', async () => {
    const event = {
      id: 'test-1',
      sessionId: 'sess-1',
      type: 'start' as const,
      agent: 'test',
      payload: { action: 'test' },
      timestamp: Date.now(),
    };
    await store.addEvent(event);
    const events = store.getEvents('sess-1');
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'test-1');
  });

  it('returns empty array for unknown session', () => {
    const events = store.getEvents('nonexistent');
    assert.deepEqual(events, []);
  });

  it('lists sessions', async () => {
    await store.addEvent({
      id: 'test-2',
      sessionId: 'sess-list',
      type: 'start' as const,
      agent: 'test', 
      payload: {},
      timestamp: Date.now(),
    });
    const sessions = store.getSessions();
    assert.ok(sessions.includes('sess-list'));
  });

  it('handles atomic writes', async () => {
    const event = {
      id: 'atomic-1',
      sessionId: 'sess-atomic',
      type: 'complete' as const,
      agent: 'test',
      payload: {},
      timestamp: Date.now(),
    };
    await store.addEvent(event);
    const events = store.getEvents('sess-atomic');
    assert.equal(events.length, 1);
    // Verify no .tmp files remain
    const files = fs.readdirSync(path.join(tmpDir, '.agent-flow', 'data'));
    assert.ok(!files.some(f => f.endsWith('.tmp')));
  });
});
```

- [ ] **10c: Create `src/hooks/session.test.ts`**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../../store/index.js';
import { PluginContainer } from '../../plugin-container.js';
import { createSessionHook } from './session.js';

describe('createSessionHook', () => {
  let tmpDir: string;
  let store: PluginStore;
  let container: PluginContainer;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    container = new PluginContainer();
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs session.created event', async () => {
    const hooks = createSessionHook(store, container);
    await hooks['session.created']({ session: { id: 'abc', title: 'test' } });
    assert.equal(container.sessionId, 'abc');
    const events = store.getEvents('abc');
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'start');
  });

  it('logs session.idle event', async () => {
    const hooks = createSessionHook(store, container);
    container.sessionId = 'idle-test';
    await hooks['session.idle']();
    const events = store.getEvents('idle-test');
    assert.equal(events.some(e => e.type === 'complete'), true);
    assert.equal(container.sessionId, null);
  });

  it('logs session.error event', async () => {
    const hooks = createSessionHook(store, container);
    container.sessionId = 'err-test';
    await hooks['session.error']({ error: { message: 'boom' } });
    const events = store.getEvents('err-test');
    assert.equal(events.some(e => e.type === 'error' && e.payload.description === 'boom'), true);
  });
});
```

- [ ] **10d: Create `src/hooks/tool.test.ts`**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../../store/index.js';
import { PluginContainer } from '../../plugin-container.js';
import { createToolHooks } from './tool.js';

describe('createToolHooks', () => {
  let tmpDir: string;
  let store: PluginStore;
  let container: PluginContainer;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    container = new PluginContainer();
    container.sessionId = 'tool-test';
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs task event on tool.execute.before', async () => {
    const hooks = createToolHooks(store, container);
    await hooks['tool.execute.before']({ tool: 'bash', args: { command: 'ls' } });
    const events = store.getEvents('tool-test');
    const taskEvents = events.filter(e => e.type === 'task' && e.payload.action === 'bash');
    assert.equal(taskEvents.length, 1);
    assert.equal(taskEvents[0].agent, 'shell');
  });

  it('maps tools to correct agents', async () => {
    const hooks = createToolHooks(store, container);
    const testCases = [
      { tool: 'task', expected: 'delegator' },
      { tool: 'read', expected: 'reader' },
      { tool: 'write', expected: 'writer' },
      { tool: 'edit', expected: 'editor' },
      { tool: 'grep', expected: 'searcher' },
      { tool: 'glob', expected: 'finder' },
      { tool: 'webfetch', expected: 'fetcher' },
      { tool: 'unknown', expected: 'opencode' },
    ];
    for (const { tool, expected } of testCases) {
      const initialCount = store.getEvents('tool-test').length;
      await hooks['tool.execute.before']({ tool, args: {} });
      const newEvents = store.getEvents('tool-test').slice(initialCount);
      const taskEvent = newEvents.find(e => e.type === 'task');
      assert.equal(taskEvent?.agent, expected, `tool ${tool} should map to ${expected}`);
    }
  });

  it('creates dispatch event for subagent_type', async () => {
    const hooks = createToolHooks(store, container);
    await hooks['tool.execute.before']({
      tool: 'task',
      args: { description: 'test task', subagent_type: 'tester' },
    });
    const events = store.getEvents('tool-test');
    const dispatchEvents = events.filter(e => e.type === 'dispatch');
    assert.ok(dispatchEvents.length >= 1);
    const lastDispatch = dispatchEvents[dispatchEvents.length - 1];
    assert.equal(lastDispatch.targetAgent, 'tester');
  });

  it('logs error event on tool.execute.after with error', async () => {
    const hooks = createToolHooks(store, container);
    const initialCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.after'](
      { tool: 'bash', args: {} },
      { error: 'Command failed' }
    );
    const newEvents = store.getEvents('tool-test').slice(initialCount);
    const errorEvent = newEvents.find(e => e.type === 'error');
    assert.ok(errorEvent);
    assert.equal(errorEvent?.payload.description, 'Command failed');
  });

  it('logs complete event on tool.execute.after success', async () => {
    const hooks = createToolHooks(store, container);
    const initialCount = store.getEvents('tool-test').length;
    await hooks['tool.execute.after'](
      { tool: 'read', args: {} },
      { result: 'file content' }
    );
    const newEvents = store.getEvents('tool-test').slice(initialCount);
    const completeEvent = newEvents.find(e => e.type === 'complete');
    assert.ok(completeEvent);
    assert.equal(completeEvent?.agent, 'reader');
  });

  it('handles FIFO stack for concurrent same-tool calls', async () => {
    const hooks = createToolHooks(store, container);
    const beforeEvents = store.getEvents('tool-test').length;

    // Simulate two concurrent bash calls
    await hooks['tool.execute.before']({ tool: 'bash', args: { cmd: 'first' } });
    await hooks['tool.execute.before']({ tool: 'bash', args: { cmd: 'second' } });

    // Complete first
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { cmd: 'first' } },
      { result: 'output 1' }
    );
    // Complete second
    await hooks['tool.execute.after'](
      { tool: 'bash', args: { cmd: 'second' } },
      { result: 'output 2' }
    );

    // Both should produce valid events (no crashes, no missing entries)
    const allEvents = store.getEvents('tool-test');
    const newOnes = allEvents.slice(beforeEvents);
    const completes = newOnes.filter(e => e.type === 'complete');
    assert.equal(completes.length, 2);
    // inFlight should be cleaned up
    assert.equal(container.inFlight.has('bash'), false);
  });
});
```

- [ ] **10e: Create `src/hooks/message.test.ts`**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../../store/index.js';
import { PluginContainer } from '../../plugin-container.js';
import { createMessageHooks } from './message.js';

describe('createMessageHooks', () => {
  let tmpDir: string;
  let store: PluginStore;
  let container: PluginContainer;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    container = new PluginContainer();
    container.sessionId = 'msg-test';
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('logs assistant messages', async () => {
    const hooks = createMessageHooks(store, container);
    await hooks['message.updated']({
      message: { id: 'm1', role: 'assistant', content: 'hello' },
    });
    const events = store.getEvents('msg-test');
    const msgs = events.filter(e => e.type === 'message');
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].payload.messageId, 'm1');
  });

  it('skips non-assistant messages', async () => {
    const hooks = createMessageHooks(store, container);
    const beforeCount = store.getEvents('msg-test').length;
    await hooks['message.updated']({
      message: { id: 'm2', role: 'user', content: 'hi' },
    });
    const afterCount = store.getEvents('msg-test').length;
    assert.equal(afterCount, beforeCount);
  });

  it('deduplicates by message ID', async () => {
    const hooks = createMessageHooks(store, container);
    const beforeCount = store.getEvents('msg-test').length;
    await hooks['message.updated']({
      message: { id: 'm3', role: 'assistant', content: 'dup' },
    });
    await hooks['message.updated']({
      message: { id: 'm3', role: 'assistant', content: 'dup' },
    });
    const afterCount = store.getEvents('msg-test').length;
    const newCount = afterCount - beforeCount;
    assert.equal(newCount, 1);
  });

  it('truncates long content to 300 chars', async () => {
    const hooks = createMessageHooks(store, container);
    const long = 'x'.repeat(500);
    await hooks['message.updated']({
      message: { id: 'm4', role: 'assistant', content: long },
    });
    const events = store.getEvents('msg-test');
    const msg = events.filter(e => e.type === 'message').find(e => e.payload.messageId === 'm4');
    assert.ok(msg?.payload.description?.endsWith('...'));
    assert.ok((msg?.payload.description?.length ?? 0) <= 304); // 300 + '...'
  });
});
```

- [ ] **10f: Create `src/tools/index.test.ts`**

```typescript
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { PluginStore } from '../../store/index.js';
import { createTools } from './index.js';

describe('createTools', () => {
  let tmpDir: string;
  let store: PluginStore;
  let tools: ReturnType<typeof createTools>;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-test-'));
    store = new PluginStore(tmpDir);
    tools = createTools(store);
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('agentflow_sessions returns session list', async () => {
    const result = await tools.agentflow_sessions.execute({});
    const parsed = JSON.parse(result);
    assert.ok(Array.isArray(parsed.sessions));
    assert.equal(typeof parsed.count, 'number');
  });

  it('agentflow_events returns events for a session', async () => {
    await store.addEvent({
      id: 'ev-1',
      sessionId: 'q-sess',
      type: 'start' as const,
      agent: 'test',
      payload: {},
      timestamp: Date.now(),
    });
    const result = await tools.agentflow_events.execute({ sessionId: 'q-sess' });
    const events = JSON.parse(result);
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'ev-1');
  });

  it('agentflow_stats returns aggregated stats', async () => {
    const result = await tools.agentflow_stats.execute({});
    const stats = JSON.parse(result);
    assert.equal(typeof stats.total, 'number');
    assert.equal(typeof stats.errors, 'number');
    assert.ok(stats.byType);
    assert.ok(stats.byAgent);
  });
});
```

- [ ] **10g: Run all tests**

Run: `node --test src/**/*.test.ts`
Expected: All tests pass

- [ ] **10h: Commit**

```bash
git add src/plugin-container.test.ts src/store/index.test.ts src/hooks/session.test.ts src/hooks/tool.test.ts src/hooks/message.test.ts src/tools/index.test.ts
git commit -m "test: add test suite for all modules"
```

---

### Task 11: Add ESLint config

**Files:**
- Create: `eslint.config.js`

- [ ] **11a: Create `eslint.config.js`**

```javascript
// @ts-check
import tseslint from 'typescript-eslint';
import js from '@eslint/js';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: ['dist/', 'node_modules/'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];
```

- [ ] **11b: Install dev deps**

Run: `npm install --save-dev eslint @eslint/js typescript-eslint`

- [ ] **11c: Run lint to verify**

Run: `npx eslint src/`
Expected: Clean or manageable output

- [ ] **11d: Commit**

```bash
git add eslint.config.js package.json package-lock.json
git commit -m "chore: add ESLint config"
```

---

### Task 12: Add CI/CD config

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **12a: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm run lint
```

- [ ] **12b: Create `.github/workflows/publish.yml`**

```yaml
name: Publish

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **12c: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions for test and publish"
```

---

### Task 13: Build and verify

- [ ] **13a: Clean old compiled output**

```bash
git rm -r --cached index.js index.d.ts types.js types.d.ts hooks/ store/ tools/
# Don't delete the source files — just the old compiled output
rm -f index.js index.d.ts types.js types.d.ts
rm -rf hooks/ store/ tools/
```

- [ ] **13b: Build**

```bash
npm run build
```

Expected: TypeScript compiles without errors to `dist/`

- [ ] **13c: Run all tests**

```bash
npm test
```

Expected: All pass

- [ ] **13d: Run lint**

```bash
npm run lint
```

Expected: Clean

- [ ] **13e: Commit**

```bash
git add -A
git commit -m "chore: clean old compiled output, verify build"
```

---

### Task 14: Final review and version bump

- [ ] **14a: Verify git status is clean**

```bash
git status
```

- [ ] **14b: Verify build output**

```bash
ls dist/
```

Expected: `dist/index.js`, `dist/index.d.ts`, `dist/types.js`, `dist/types.d.ts`, `dist/hooks/`, `dist/store/`, `dist/tools/`, `dist/util/`

- [ ] **14c: Verify npm package contents**

```bash
npm pack --dry-run
```

Expected: Only `dist/` contents, `package.json`, `README.md`, `LICENSE`, etc.
