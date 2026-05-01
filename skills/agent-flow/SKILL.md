---
name: agent-flow
description: Real-time agent flow monitoring. Load at session start to log all agent activity (start, delegation, complete, error) to the Agent Flow dashboard. Required in every session.
---

# Agent Flow — Monitoring Skill

## Overview

Agent Flow visualizes agent/subagent workflows in real time. Every agent must log its operations — start, delegation, completion, errors — so the dashboard shows the full activity graph.

## When to load

Load this skill at the **start of every session**. It tells every agent exactly how to log events.

## One-time setup per session

### Generate a sessionId

The **primary agent** (the one that starts the session) must generate a session ID and pass it to all subagents:

```js
const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
```

Pass `sessionId` to every subagent you delegate to — this groups all events into the same session.

### Server endpoint

```
POST http://localhost:3001/api/agent/event
Content-Type: application/json
```

## How to log

All agents use `fetch()`, fire-and-forget (never block on logging):

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ /* event data */ })
}).catch(() => {});
```

## Event types

### 1. START — when an agent begins work

Log immediately after receiving a task, BEFORE doing any work.

Include `model` — the AI model powering this agent (find it in your system prompt, e.g. "claude-sonnet-4", "deepseek-v4-pro").

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'your-agent-name',    // Your agent identifier
    sessionId: sessionId,        // From the primary agent
    type: 'start',
    action: 'short-task-name',   // e.g. 'implement-feature'
    model: 'your-model-name',    // e.g. 'claude-sonnet-4-20250514'
    description: 'What you are about to do'
  })
}).catch(() => {});
```

### 2. DELEGATION — when dispatching a subagent

Log BEFORE delegating to a subagent. This creates the parent→child link in the flow graph.

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'your-agent-name',    // The delegator
    sessionId: sessionId,
    type: 'delegation',
    targetAgent: 'subagent-name', // Who you are delegating to
    reason: 'Why this delegation is needed'
  })
}).catch(() => {});

// Then pass sessionId to the subagent
```

### 3. COMPLETE — when an agent finishes

Log AFTER producing output, BEFORE returning to the delegator.

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'your-agent-name',
    sessionId: sessionId,
    type: 'complete',
    action: 'short-task-name',
    tokens: 4500,                 // Approximate tokens used
    description: 'What was accomplished'
  })
}).catch(() => {});
```

### 4. ERROR — when something fails

```js
fetch('http://localhost:3001/api/agent/event', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    agent: 'your-agent-name',
    sessionId: sessionId,
    type: 'error',
    description: 'What went wrong',
    payload: { error: 'Error details' }
  })
}).catch(() => {});
```

## Delegation pattern

- The **primary agent** generates `sessionId` and logs its own `start`
- When delegating, it logs a `delegation` event with `targetAgent` set
- **Always pass `sessionId`** to subagents so their events are grouped
- Subagents log their own `start` and `complete`
- Subagents should NOT delegate further without the primary agent's approval

## What NOT to log

These are internal operations — no log event needed:
- Reading or searching files
- Running build/test commands
- Asking clarifying questions

## Anti-patterns

❌ Starting work before logging `start`
❌ Forgetting to pass `sessionId` to subagents
❌ Using `await` on the fetch — must be fire-and-forget (`.catch(() => {})`)
❌ Multiple agents using the same `agent` name

## Quick reference

```js
function log(agent, type, extra = {}) {
  fetch('http://localhost:3001/api/agent/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, sessionId, type, ...extra })
  }).catch(() => {});
}

// Usage:
log('primary-agent', 'start', { action: 'plan', model: 'claude-sonnet-4', description: 'Planning task' });
log('primary-agent', 'delegation', { targetAgent: 'subagent', reason: 'Implementation needed' });
log('subagent', 'start', { action: 'build', model: 'claude-sonnet-4', description: 'Building feature' });
log('subagent', 'complete', { action: 'build', tokens: 1200, description: 'Done' });
log('primary-agent', 'complete', { action: 'plan', tokens: 500 });
```

## Dashboard

```
http://localhost:3001
```
