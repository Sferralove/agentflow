import fs from 'fs';
import path from 'path';
import type { AgentEvent, EventType } from './types.js';

const DATA_DIR = '.agent-flow/data';

interface OpenCodeEvent {
  type: string;
  sessionID?: string;
  sessionId?: string;
  session?: { id?: string; title?: string };
  properties?: Record<string, unknown>;
  tool?: string;
  command?: string;
  title?: string;
  error?: { message?: string };
  status?: string;
}

export interface AgentFlowEvent {
  id: string;
  ts: string;
  sessionId: string;
  type: string;
  phase: string;
  status?: string;
  label: string;
  payload: Record<string, unknown>;
}

function eventId(): string {
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function detectSessionId(event: OpenCodeEvent): string | undefined {
  return event.sessionID || event.sessionId || event.session?.id
    || (event.properties?.sessionID as string)
    || (event.properties?.sessionId as string);
}

function detectPhase(type: string): string {
  if (type.startsWith('session.')) return 'session';
  if (type.startsWith('message.')) return 'message';
  if (type.startsWith('tool.')) return 'tool';
  if (type.startsWith('file.')) return 'file';
  if (type.startsWith('todo.')) return 'todo';
  if (type.startsWith('permission.')) return 'permission';
  return 'system';
}

function toAgentFlowEvent(raw: OpenCodeEvent): AgentFlowEvent {
  return {
    id: eventId(),
    ts: new Date().toISOString(),
    sessionId: detectSessionId(raw) || 'unknown',
    type: raw.type || 'unknown',
    phase: detectPhase(raw.type || ''),
    status: raw.status,
    label: raw.tool || raw.command || raw.title || raw.type || 'event',
    payload: raw as unknown as Record<string, unknown>,
  };
}

function persistEvent(dataDir: string, event: AgentFlowEvent): void {
  const dir = path.join(dataDir, 'sessions');
  fs.mkdirSync(dir, { recursive: true });

  const sessionId = event.sessionId || 'unknown';
  const filePath = path.join(dir, `${sessionId}.json`);

  let existing: { events: AgentEvent[] } = { events: [] };
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch { /* ignore */ }
  }

  const typeMap: Record<string, EventType> = {
    'session.created': 'start',
    'session.idle': 'complete',
    'session.error': 'error',
    'tool.execute.before': 'task',
    'tool.execute.after': 'complete',
    'message.updated': 'message',
  };
  const mappedType = typeMap[event.type] || 'message';

  existing.events.push({
    id: event.id,
    sessionId: event.sessionId,
    type: mappedType,
    agent: event.label,
    payload: event.payload,
    timestamp: new Date(event.ts).getTime(),
  });

  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(existing, null, 2), { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function buildCollector(dataDir: string, broadcaster?: (event: AgentFlowEvent) => void) {
  let abortController: AbortController | null = null;

  async function connect(url: string, username: string, password: string): Promise<void> {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'text/event-stream',
        },
        signal: abortController.signal,
      });

      if (!res.ok || !res.body) {
        console.error(`[agent-flow] SSE connection failed: ${res.status}`);
        return;
      }

      console.log(`[agent-flow] Connected to OpenCode SSE: ${url}`);

      const reader = (res.body as ReadableStream<Uint8Array>)
        .pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>)
        .getReader();

      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const dataLines = chunk
            .split('\n')
            .filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trim());

          if (!dataLines.length) continue;

          try {
            const raw = JSON.parse(dataLines.join('\n'));
            const event = raw.event ?? raw;
            const afEvent = toAgentFlowEvent(event);
            persistEvent(dataDir, afEvent);
            broadcaster?.(afEvent);
          } catch (err) {
            // skip malformed events
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error(`[agent-flow] SSE error:`, err);
    }
  }

  function disconnect(): void {
    abortController?.abort();
    abortController = null;
  }

  return { connect, disconnect };
}
