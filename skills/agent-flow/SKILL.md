---
name: agent-flow
description: Real-time agent flow monitoring. Load at session start to log all agent activity (start, delegation, complete, error) to the Agent Flow dashboard. Required in every session.
---

# Agent Flow — Monitoring Skill

## Overview

Agent Flow is a per-project monitoring tool that visualizes agent/subagent workflows in real time. Every agent must log its operations — start, delegation, completion, errors — so the dashboard shows the full activity graph.

## When to use this skill

Load this skill at the **start of every session** (or when the Builder loads its instructions). It tells agents exactly how to log events to the Agent Flow server.

## Setup (one-time per session)

### Generate a sessionId

The **Builder** must generate a session ID at the start of every session and pass it to all subagents:

```js
const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
```

Store it in memory or pass it explicitly to every delegated agent.

### Server endpoint

```
POST http://localhost:3001/api/agent/event
Content-Type: application/json
```

## Required header

All agents must use `fetch()` with this exact header:

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* event data */ })
}).catch(() => {}); // Fire-and-forget, never block on logging
```

## Event types and format

### 1. START — when an agent begins a task

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'backend-dev',        // Your agent name
    sessionId: sessionId,         // From Builder
    type: 'start',
    action: 'implement-feature',  // Short name of the task
    description: 'Building user auth middleware'
  })
}).catch(() => {});
```

**When:** Immediately upon receiving a delegated task. Log BEFORE doing any work.

### 2. DELEGATION — when the Builder dispatches a subagent

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'builder',
    sessionId: sessionId,
    type: 'delegation',
    targetAgent: 'backend-dev',
    reason: 'Implementation needed for API routes'
  })
}).catch(() => {});
```

**When:** Right before delegating a task to a subagent. This creates the parent → child link in the flow graph.

**IMPORTANT:** Always pass `sessionId` to the subagent so its events are grouped in the same session.

### 3. COMPLETE — when an agent finishes a task

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'backend-dev',
    sessionId: sessionId,
    type: 'complete',
    action: 'implement-feature',
    tokens: 4500,               // Approximate tokens used
    description: 'Auth middleware done, 3 files changed'
  })
}).catch(() => {});
```

**When:** After finishing a task. Log AFTER producing your output but BEFORE returning to the delegator.

### 4. ERROR — when something goes wrong

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'backend-dev',
    sessionId: sessionId,
    type: 'error',
    description: 'TypeScript build failed: TS2345',
    payload: { error: 'Type mismatch in route handler' }
  })
}).catch(() => {});
```

**When:** Any time an agent encounters an error or fails a task.

## Delegation rules

The **Builder** orchestrates. Subagents do not delegate further without Builder approval.

| Agent role | Delegates to | Reason |
|------------|-------------|--------|
| Builder | product-manager | Unclear requirements |
| Builder | tech-lead | Architecture decisions |
| Builder | backend-dev | Implementation |
| Builder | frontend-dev | UI work |
| Builder | tester | Testing/validation |
| Builder | reviewer | Pre-commit review |
| Builder | security-engineer | Security concerns |
| Backend Dev | database-engineer | Schema/migrations |
| Tester | backend-dev / frontend-dev | Bug fixes |

## Non-logging events

These do NOT need a log event because they're internal to the agent:
- Reading files (read tool)
- Searching code (grep/glob)
- Running build/test commands (bash tool)
- Asking clarifying questions to the user

## Anti-patterns to avoid

❌ Starting work before logging `start`
❌ Forgetting to pass `sessionId` to subagents
❌ Using `await` on the fetch (must be fire-and-forget — `.catch(() => {})`)
❌ Using `POST` for GET operations
❌ Logging from sub-sub-agents without Builder knowing
❌ Multiple agents using the same `agent` name in the same session

## Quick reference

```js
// Template for logging
function log(agent, type, extra = {}) {
  fetch('http://localhost:3001/api/agent/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, sessionId, type, ...extra })
  }).catch(() => {});
}

// Usage:
log('builder', 'start', { action: 'plan-task', description: 'Planning...' });
log('builder', 'delegation', { targetAgent: 'backend-dev', reason: 'Build API' });
log('backend-dev', 'start', { action: 'build-api' });
log('backend-dev', 'complete', { action: 'build-api', tokens: 1200, description: 'Done' });
log('builder', 'complete', { action: 'plan-task', tokens: 500 });
```

## Viewing the dashboard

```
http://localhost:3000
```
