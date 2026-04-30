# Agent Flow — Design Spec

**Date:** 2026-04-29
**Status:** Draft

## Overview

Agent Flow è un tool per-progetto che monitora e visualizza il lavoro di agenti/subagenti in OpenCode tramite grafo flow. Mostra dispatch, task, flussi ed esiti in real-time.

## Architettura

### Struttura Pacchetto

```
agent-flow/
├── src/
│   ├── cli/           # Comandi: init, serve, status, export
│   ├── mcp/           # MCP Server + tools
│   ├── ws/            # WebSocket server
│   ├── store/         # Event store (in-memory + persistenza JSON)
│   └── types/         # TypeScript types condivisi
├── frontend/
│   ├── src/           # React + Tailwind components
│   └── dist/          # Build output (servito dal server)
├── package.json
└── tsconfig.json
```

### Stack

- **Runtime:** Node.js + TypeScript
- **MCP:** `@modelcontextprotocol/sdk`
- **WebSocket:** `ws`
- **Frontend:** React + Tailwind + React Flow
- **Build:** Vite (frontend), tsc (backend)

## Flusso Dati

1. Agenti OpenCode chiamano MCP tool `send_event`
2. MCP server riceve evento, salva in store, crea/aggiorna AgentInfo
3. WS server broadcasta a tutti i client connessi
4. Frontend React riceve via WS, aggiorna flow graph
5. CLI `serve` avvia MCP + WS + serve frontend statico

## MCP Tools

| Tool | Descrizione | Input | Output |
|------|-------------|-------|--------|
| `send_event` | Agente invia evento | type, payload, metadata | { success, eventId } |
| `query_events` | Query eventi con filtri | agent?, type?, timeRange? | AgentEvent[] |
| `get_session` | Recupera sessione completa | sessionId | { session, events } |
| `get_agent_info` | Recupera metadata agente | agentId | AgentInfo |
| `get_agent_tree` | Recupera albero agenti | sessionId | AgentNode[] |

## Data Models

### AgentEvent

```typescript
interface AgentEvent {
  id: string;           // UUID
  sessionId: string;    // Sessione agente
  type: 'start' | 'complete' | 'dispatch' | 'task' | 'error' | 'message';
  agent: string;        // Nome agente
  targetAgent?: string; // Per dispatch
  payload: Record<string, unknown>;
  timestamp: number;
}
```

### AgentInfo

```typescript
interface AgentInfo {
  id: string;
  name: string;
  type: 'main' | 'subagent';
  parentId?: string;
  children: string[];
  capabilities: string[];
  status: 'idle' | 'running' | 'completed' | 'error';
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  tasksCompleted: number;
  tasksFailed: number;
}
```

## Frontend Components

| Component | Descrizione |
|-----------|-------------|
| `FlowGraph` | Grafo principale (React Flow), nodi=agenti, edges=dispatch |
| `EventTimeline` | Lista eventi cronologica |
| `AgentCard` | Dettaglio agente (status, task, errori) |
| `SessionSelector` | Switch tra sessioni |
| `AgentTree` | Sidebar con gerarchia agenti |
| `Dashboard` | Layout principale |

## WebSocket Protocol

- Client connette a `ws://localhost:PORT`
- Server push: `{ type: 'event', data: AgentEvent }`
- Client ack opzionale
- Reconnect con last-event-id
- Heartbeat ogni 30s

## CLI Commands

| Command | Descrizione |
|---------|-------------|
| `agent-flow init` | Crea `.agent-flow/config.json`, aggiunge MCP server config a OpenCode (modifica `.opencode/mcp.json` o equivalente) |
| `agent-flow serve [--port N]` | Avvia server MCP + WS + frontend |
| `agent-flow status` | Mostra server status, sessioni attive |
| `agent-flow export [--format json\|csv]` | Esporta eventi |

## Error Handling

- **MCP server:** catch tool errors → evento `error` auto-generato
- **WS:** reconnect automatico, buffer eventi durante disconnect
- **Store:** JSON append con flush periodico, recovery da crash all'avvio
- **Frontend:** graceful degradation, ultimo stato noto

## Testing

- **Unit:** MCP tool handlers, event store, WS protocol
- **Integration:** CLI commands, MCP + WS + frontend E2E
- **Mock:** agenti fake per test dispatch chain

## Installazione per-Progetto

```bash
npm install -D agent-flow
npx agent-flow init    # Setup nel progetto
npx agent-flow serve   # Avvia dashboard
```
