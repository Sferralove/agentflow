---
name: agent-flow
description: Real-time agent flow monitoring. Load at session start to log all agent activity (start, delegation, complete, error) to the Agent Flow dashboard. Uses MCP tools as primary method, HTTP fallback available.
---

# Agent Flow — Monitoring Skill

## Overview

Agent Flow visualizza i workflow agent/subagent in tempo reale. Ogni agente deve loggare le sue operazioni — start, delegation, complete, error — così la dashboard mostra il grafo completo.

## When to load

Caricare questa skill all'**inizio di ogni sessione**. Dice a ogni agente esattamente come loggare eventi.

## One-time setup per sessione

### Generare un sessionId

L'**agente primario** (quello che avvia la sessione) deve generare un session ID e passarlo a tutti i subagenti:

```js
const sessionId = 'session-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
```

Passa `sessionId` a ogni subagente a cui deleghi — raggruppa tutti gli eventi nella stessa sessione.

## Come loggare — MCP tools (primario)

Usa i **tool MCP** `agent-flow`. Sono nativi OpenCode, precisi, nessun URL da gestire.

### 1. START — quando un agente inizia

Logga subito dopo aver ricevuto un task, PRIMA di fare qualsiasi lavoro.

Includi `model` — il modello AI che alimenta questo agente (lo trovi nel system prompt, es. "claude-sonnet-4", "deepseek-v4-pro").

```
Usa il tool agent-flow send_event:
- type: "start"
- agent: "tuo-nome-agente"
- sessionId: sessionId
- payload: { action: "nome-task", model: "tuo-modello", description: "Cosa stai per fare" }
```

### 2. DELEGATION — quando deleghi a un subagente

Logga PRIMA di delegare. Crea il link parent→child nel grafo.

```
Usa il tool agent-flow send_event:
- type: "delegation"
- agent: "tuo-nome-agente"
- sessionId: sessionId
- targetAgent: "nome-subagente"
- payload: { reason: "Perché serve questa delega" }
```

Poi passa `sessionId` al subagente.

### 3. COMPLETE — quando un agente finisce

Logga DOPO aver prodotto output, PRIMA di tornare al delegante.

```
Usa il tool agent-flow send_event:
- type: "complete"
- agent: "tuo-nome-agente"
- sessionId: sessionId
- payload: { action: "nome-task", tokens: 4500, description: "Cosa hai realizzato" }
```

### 4. ERROR — quando qualcosa fallisce

```
Usa il tool agent-flow send_event:
- type: "error"
- agent: "tuo-nome-agente"
- sessionId: sessionId
- payload: { description: "Cosa è andato storto", error: "Dettagli errore" }
```

## Fallback HTTP (se MCP non disponibile)

Se i tool MCP non sono configurati, usa `fetch()` fire-and-forget:

```js
function log(agent, type, extra = {}) {
  fetch('http://localhost:3001/api/agent/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, sessionId, type, ...extra })
  }).catch(() => {});
}
```

## Delegation pattern

- **Agente primario** genera `sessionId` e logga il proprio `start`
- Quando delega, logga `delegation` con `targetAgent`
- **Passa sempre `sessionId`** ai subagenti
- I subagenti loggano i propri `start` e `complete`
- I subagenti NON devono delegare ulteriormente senza approvazione

## Cosa NON loggare

Operazioni interne — nessun evento necessario:
- Leggere o cercare file
- Eseguire comandi build/test
- Fare domande di chiarimento

## Anti-patterns

❌ Iniziare il lavoro prima di loggare `start`
❌ Dimenticare di passare `sessionId` ai subagenti
❌ Usare `await` sul fetch HTTP — deve essere fire-and-forget
❌ Agenti multipli con lo stesso nome `agent`

## Dashboard

```
http://localhost:3001
```
