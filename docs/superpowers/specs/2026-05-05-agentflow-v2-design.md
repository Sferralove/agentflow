# AgentFlow v2 — Design Spec

**Data:** 2026-05-05  
**Stato:** Approvato  
**Obiettivo:** Strumento per-progetto per tracciare in tempo reale flusso di lavoro agenti/subagenti OpenCode.

---

## 1. Panoramica

Sistema composto da 3 componenti integrati in un unico pacchetto npm:

- **Plugin OpenCode** — hook nativi, scrive eventi su file JSONL
- **Server Bun** — legge JSONL, serve SSE + HTTP API
- **Dashboard React** — ReactFlow grafo agenti + panel dettaglio eventi

Installazione: `npx @agentflow/cli init` nel progetto, poi `agentflow serve`. Zero configurazione.

---

## 2. Architettura

```
┌──────────────┐     fs.appendFile     ┌──────────────────┐
│  Plugin      │ ───────────────────→  │  .agentflow/     │
│  (OpenCode)  │                       │  sessions/       │
└──────────────┘                       │  sess-abc.jsonl  │
                                       └────────┬─────────┘
                                                │ fs.watch
┌──────────────┐     SSE (replay+live)  ┌───────▼─────────┐
│  Dashboard   │ ◄────────────────────  │  Server (Bun)   │
│  ReactFlow   │                        │  :3001          │
│  :3000       │                        └─────────────────┘
└──────────────┘
```

**Flusso:**
1. Plugin hook OpenCode → `fs.appendFile('.agentflow/sessions/{sessionId}.jsonl', event)`
2. Server `fs.watch` sul file → broadcast SSE a dashboard connessa
3. Dashboard `EventSource('/api/stream?session=...')` → riceve replay batch + eventi live
4. Server offline → eventi accumulati nel file, replay completo a riconnessione

**Decisione architetturale:** JSONL + SSE invece di HTTP POST diretto. JSONL = buffer persistente, nessun evento perso se server non in esecuzione. SSE = streaming nativo browser, no WebSocket complexity.

---

## 3. Modello Dati

### 3.1 Eventi catturati dal plugin

```jsonl
{"type":"session.created","id":"evt-001","sessionId":"sess-abc","timestamp":1706000000}

{"type":"tool.start","id":"evt-002","sessionId":"sess-abc","timestamp":1706000001,"agent":"builder","tool":"task","input":{"subagent_type":"backend-dev","description":"Implement auth","prompt":"..."}}

{"type":"tool.end","id":"evt-003","sessionId":"sess-abc","timestamp":1706000012,"agent":"builder","tool":"task","duration":11000,"output":"ok","error":null}

{"type":"tool.start","id":"evt-004","sessionId":"sess-abc","timestamp":1706000015,"agent":"backend-dev","tool":"write","input":{"filePath":"/src/auth.ts","size":1200}}

{"type":"tool.end","id":"evt-005","sessionId":"sess-abc","timestamp":1706000020,"agent":"backend-dev","tool":"write","duration":5000,"output":null,"error":null}

{"type":"tool.start","id":"evt-006","sessionId":"sess-abc","timestamp":1706000030,"agent":"backend-dev","tool":"bash","input":{"command":"pytest tests/auth -v","description":"Run auth tests"}}

{"type":"tool.end","id":"evt-007","sessionId":"sess-abc","timestamp":1706000035,"agent":"backend-dev","tool":"bash","duration":4500,"output":"3 passed","error":null}

{"type":"session.error","id":"evt-008","sessionId":"sess-abc","timestamp":1706000100,"agent":"backend-dev","error":"Bash timeout after 120s"}

{"type":"session.compacted","id":"evt-009","sessionId":"sess-abc","timestamp":1706000200}

{"type":"session.idle","id":"evt-010","sessionId":"sess-abc","timestamp":1706000300,"agent":"builder"}
```

### 3.2 Tipi di evento

| Tipo | Descrizione | Tool |
|------|-------------|------|
| `session.created` | Nuova sessione avviata | - |
| `session.error` | Sessione in errore | - |
| `session.compacted` | Sessione compattata | - |
| `session.idle` | Agente fermo, in attesa | - |
| `tool.start` | Tool in esecuzione | task, write, edit, bash |
| `tool.end` | Tool completato | task, write, edit, bash |

**Tool tracciati:** `task`, `write`, `edit`, `bash` (modificano stato).  
**Tool ignorati:** `read`, `glob`, `grep`, `webfetch` (solo consultazione, troppo rumorosi).

### 3.3 Struttura dati server

```ts
interface AgentNode {
  id: string           // nome agente (builder, backend-dev, ...)
  name: string         // nome display (Builder, Backend Dev)
  type: 'main' | 'subagent'
  parentId?: string    // chi ha delegato questo agente
  status: 'idle' | 'running' | 'completed' | 'error' | 'compacted'
  sessionId: string
  startedAt: number
  completedAt?: number
  tasksCompleted: number
  tasksFailed: number
}

interface AgentEdge {
  id: string
  source: string       // agente padre
  target: string       // agente figlio (delegato)
  tool: string         // 'task'
  description: string  // descrizione task
}
```

**Inferenza:** Il server ricostruisce il grafo dagli eventi:
- `tool.start` con `tool="task"` → crea nodo subagente da `input.subagent_type`
- Stesso `sessionId` + chain di deleghe → relazione padre-figlio
- `tool.end` con `tool="task"` + `output` → aggiorna stato nodo
- `session.error` → nodo in errore

---

## 4. File System

```
progetto/
├── .agentflow/
│   ├── sessions/
│   │   ├── sess-abc.jsonl      (attiva)
│   │   ├── sess-def.jsonl      (archiviata)
│   │   └── sess-old.jsonl.gz   (compressa dopo 1h idle)
│   └── pid                       (PID server per stop)
├── .opencode/
│   └── plugins/
│       └── agentflow.ts          (plugin copiato da init)
└── .gitignore                    (+ .agentflow/)
```

**Pulizia:** Dopo 1 ora da ultimo `session.idle`, sessione archiviata (gzip del JSONL, rimossa da RAM server).

---

## 5. Plugin (TypeScript, 0 dipendenze runtime)

### 5.1 Approccio hook

Il plugin usa due meccanismi distinti, come documentato da OpenCode:

| Meccanismo | Hook | Eventi catturati |
|-----------|------|-----------------|
| **Hook diretto** | `tool.execute.before` | Tool start (nome, args) |
| **Hook diretto** | `tool.execute.after` | Tool end (risultato, durata, errore) |
| **Handler generico** | `event` | Tutti gli eventi di sessione (`session.*`) |

Motivazione: i docs ufficiali mostrano `event: async ({ event }) => ...` come pattern per eventi di sessione (es. notifiche su `session.idle`). Per i tool esistono hook diretti `tool.execute.before/after` con firma `(input, output)` dove `input.tool` contiene il nome tool.

### 5.2 Filtro tool

Plugin scrive solo tool che modificano stato: `task`, `write`, `edit`, `bash`.  
Ignora: `read`, `glob`, `grep`, `webfetch` (sola consultazione, rumorosi).

### 5.3 Estrazione sessionId (euristica)

I payload degli eventi non hanno un path unico per `sessionId`. Si usa estrazione euristica (ordine di priorità):

```
raw.sessionId || raw.sessionID || raw.session?.id || raw.properties?.sessionId || 'unknown'
```

### 5.4 Implementazione

```ts
// .opencode/plugins/agentflow.ts
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

async function log(evt: Record<string, unknown>) {
  const sid = evt.sessionId as string
  if (sid === 'unknown') return // skip malformed events
  const file = `${LOG_DIR}/${sid}.jsonl`
  await Bun.write(file, JSON.stringify(evt) + '\n', { append: true })
}

export const AgentFlowPlugin: Plugin = async ({ directory }) => ({
  // Hook diretto: tool in esecuzione
  "tool.execute.before": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    await log({
      type: 'tool.start',
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      sessionId: extractSessionId(input as Record<string, unknown>),
      timestamp: Date.now(),
      agent: extractAgent(input as Record<string, unknown>),
      tool,
      input: tool === 'task'
        ? { subagent_type: output.args?.subagent_type, description: output.args?.description }
        : output.args,
    })
  },

  // Hook diretto: tool completato
  "tool.execute.after": async (input: any, output: any) => {
    const tool = input.tool as string
    if (!TOOLS_TRACKED.has(tool)) return

    await log({
      type: 'tool.end',
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      sessionId: extractSessionId(input as Record<string, unknown>),
      timestamp: Date.now(),
      agent: extractAgent(input as Record<string, unknown>),
      tool,
      duration: output.duration,
      output: output.result,
      error: output.error || null,
    })
  },

  // Handler generico: eventi di sessione
  event: async ({ event }: { event: Record<string, unknown> }) => {
    const type = event.type as string
    if (!type || !type.startsWith('session.')) return

    const payload: Record<string, unknown> = {
      type,
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      sessionId: extractSessionId(event),
      timestamp: Date.now(),
      agent: extractAgent(event),
    }

    // Arricchisci con dati specifici dell'evento
    if (type === 'session.error') payload.error = event.error
    if (type === 'session.idle') payload.agent = extractAgent(event)

    await log(payload)
  },
})
```

**Nota implementativa:** Le firme esatte degli hook potrebbero variare leggermente nella versione runtime di OpenCode. Il pattern `(input, output)` per `tool.execute.before/after` e `({ event })` per il handler generico sono quelli documentati. In fase di implementazione si verificheranno e adatteranno i tipi reali.

---

## 6. Server (Bun, porta 3001)

### 6.1 Endpoint

| Metodo | Path | Descrizione |
|--------|------|-------------|
| GET | `/api/events?session=X&since=T` | Eventi per sessione, opzionale filtro timestamp |
| GET | `/api/stream?session=X` | SSE stream (replay batch + live) |
| GET | `/api/agents/:sessionId` | Grafo agenti corrente (nodi + archi) |
| GET | `/health` | Health check |

### 6.2 SSE stream behavior

1. Client connette con `?session=sess-abc`
2. Server legge `.agentflow/sessions/sess-abc.jsonl`, invia tutti eventi esistenti come batch
3. Poi `fs.watch` sul file → nuovi append → broadcast SSE
4. Client disconnect → smette broadcast (nessun leak)
5. Se nessun client connesso per una sessione → no fs.watch attivo (risparmio risorse)

### 6.3 Inferenza grafo agenti

```ts
// Il server mantiene in RAM solo la sessione corrente
const graphs = new Map<string, { nodes: AgentNode[], edges: AgentEdge[] }>()

function processEvent(evt: AgentEvent) {
  const g = graphs.get(evt.sessionId) ?? { nodes: [], edges: [] }
  
  if (evt.type === 'tool.start' && evt.tool === 'task') {
    // Crea nodo per agente delegante se non esiste
    ensureNode(g, evt.agent, 'main')
    // Crea nodo per subagente target
    const targetId = evt.input.subagent_type
    ensureNode(g, targetId, 'subagent', evt.agent)
    // Crea arco
    g.edges.push({ id: evt.id, source: evt.agent, target: targetId, 
                   tool: 'task', description: evt.input.description })
    // Aggiorna stato
    updateNodeStatus(g, targetId, 'running')
  }
  
  if (evt.type === 'tool.end' && evt.tool === 'task') {
    const status = evt.error ? 'error' : 'completed'
    updateNodeStatus(g, evt.agent, status)
    if (status === 'completed') g.nodes.find(n => n.id === evt.agent)!.tasksCompleted++
    else g.nodes.find(n => n.id === evt.agent)!.tasksFailed++
  }

  if (evt.type === 'session.error') {
    updateNodeStatus(g, evt.agent, 'error')
  }
  
  graphs.set(evt.sessionId, g)
}
```

### 6.4 Avvio/Fermo

```bash
agentflow serve          # avvia server su :3001, background
agentflow serve --port 3002  # porta personalizzata
agentflow stop           # ferma server (legge pid da .agentflow/pid)
agentflow status         # verifica se server attivo
```

---

## 7. Dashboard (React + ReactFlow + Tailwind)

### 7.1 Layout

```
┌──────────────────────────────────────────────────────────────┐
│  AgentFlow v2 — sess-abc                          [● connesso]│
├──────────────────────┬───────────────────────────────────────┤
│  Panel Dettaglio     │  Grafo Agenti (ReactFlow)              │
│  (1/3 larghezza)     │  (2/3 larghezza)                      │
│                      │                                       │
│  ⚙️ BackendDev       │     ┌──────────┐                      │
│  running · 2m 14s    │     │ Builder  │                      │
│                      │     └────┬─────┘                      │
│  Eventi:             │     ┌────┼─────┐                      │
│  task.start Auth     │  ┌──▼──┐  ┌───▼───┐                  │
│  write /src/auth.ts  │  │ PM  │  │ Back  │                  │
│  edit middleware.ts  │  └─────┘  │ Dev   │                  │
│  bash pytest ✅       │          └───┬───┘                  │
│                      │         ┌────┼─────┐                 │
│  Statistiche:        │      ┌──▼──┐ ┌───▼──┐               │
│  ✓ 4 completati      │      │Test │ │Review│               │
│  ✗ 0 falliti         │      └─────┘ └──────┘               │
│  ⏱ media 18s         │                                       │
│                      │  ■ running  ■ completed               │
│                      │  ■ error    ■ idle                    │
└──────────────────────┴───────────────────────────────────────┘
```

### 7.2 Componenti React

```
App
├── Header (titolo, sessionId, stato connessione SSE, selettore sessione)
├── MainLayout (split 1/3 - 2/3)
│   ├── DetailPanel
│   │   ├── AgentHeader (nome, status badge, durata, sessionId)
│   │   ├── EventList (eventi cronologici filtrati per agente selezionato)
│   │   │   └── EventRow (icona tool, descrizione, output, timestamp)
│   │   └── AgentStats (task completati/falliti, tempo medio)
│   └── AgentGraph (ReactFlow)
│       ├── AgentNode (nodo custom ReactFlow con colore stato)
│       └── AgentEdge (arco con label tool/descrizione)
└── Legend (barra inferiore colori stato)
```

### 7.3 Comportamento

- **Grafo:** nodi = agenti, colori = stato (blu running, verde completed, rosso error, grigio idle)
- **Click nodo:** seleziona agente, panel sinistro mostra eventi filtrati
- **Highlight nodo selezionato:** bordo glow colorato
- **Zoom/Pan:** ReactFlow built-in, zoom su subagenti
- **Aggiornamento live:** SSE `EventSource`, aggiorna grafo e panel in tempo reale
- **Selettore sessione:** dropdown in header per cambiare sessione (carica da file archiviato)

### 7.4 Colori stato

| Stato | Colore | Hex |
|-------|--------|-----|
| running | Blu | `#3b82f6` |
| completed | Verde | `#10b981` |
| error | Rosso | `#ef4444` |
| idle/waiting | Grigio | `#6b7280` |
| compacted | Viola chiaro | `#8b5cf6` |

### 7.5 Servito come file statici

La dashboard viene buildata con Vite → `dashboard/dist/`. Il server Bun serve `dist/` come file statici. L'utente finale non ha dipendenze frontend.

---

## 8. CLI

```bash
agentflow init              # Copia plugin in .opencode/plugins/, crea .agentflow/
agentflow serve             # Avvia server Bun + serve dashboard statica
agentflow serve --port 3002 # Porta personalizzata
agentflow stop              # Ferma server
agentflow status            # Mostra se server attivo, sessione corrente
agentflow clean             # Archivia sessioni vecchie (>7 giorni)
```

---

## 9. Pacchetti npm

| Pacchetto | Descrizione | Dipendenze |
|-----------|-------------|------------|
| `@agentflow/plugin` | File plugin TS da copiare nel progetto | 0 runtime, `@opencode-ai/plugin` (dev) |
| `@agentflow/cli` | CLI + server + dashboard pre-buildata | 0 (Bun API native) |

L'utente installa solo `@agentflow/cli` globalmente. `init` copia il plugin file nel progetto.

---

## 10. Performance

| Risorsa | Consumo |
|---------|---------|
| Plugin | ~0.1ms per evento (fs.appendFile async) |
| Server RAM | 8-12MB (Bun runtime + strutture sessione attiva) |
| Server CPU | <0.1% (fs.watch passivo, kernel event) |
| Dashboard | ~2MB trasferiti (build Vite ottimizzata) |
| JSONL per sessione | ~200 byte/evento, tipico 20-50KB per sessione media |
| Connessioni SSE | 1 per tab dashboard, nessuna crescita |

---

## 11. Acceptance Criteria

1. Plugin installato via `agentflow init`, funziona senza modifiche agli agenti OpenCode esistenti
2. Server avviato con `agentflow serve`, dashboard accessibile su `localhost:3000`
3. Grafo mostra agenti in tempo reale con colori stato corretti
4. Click su nodo aggiorna panel sinistro con eventi filtrati
5. Server offline → eventi accumulati in JSONL, replay completo a riconnessione
6. Plugin 0 dipendenze runtime, server 0 dipendenze runtime
7. Dashboard buildata come file statici, servita dal server Bun
8. Installazione cross-project funzionante (plugin copiato in ogni `.opencode/plugins/`)
