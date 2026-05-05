import type { PluginStore } from './store/index.js';
import type { AgentEvent, EventType } from './types.js';

/** Event type mapping: SSE raw event type → AgentEvent type */
const EVENT_TYPE_MAP: Record<string, EventType> = {
  'session.created': 'start',
  'session.idle': 'complete',
  'session.error': 'error',
  'tool.execute.before': 'task',
  'tool.execute.after': 'complete',
  'message.updated': 'message',
};

/**
 * Heuristic extraction of sessionId from various event payload shapes.
 * OpenCode events embed sessionId in different paths depending on event type.
 */
function extractSessionId(raw: Record<string, unknown>): string {
  const props = raw.properties as Record<string, unknown> | undefined;
  const session = raw.session as Record<string, unknown> | undefined;
  return (raw.sessionID as string)
    || (raw.sessionId as string)
    || (session?.id as string)
    || (props?.sessionID as string)
    || (props?.sessionId as string)
    || 'unknown';
}

/** Map raw SSE event to internal AgentEvent */
function toAgentEvent(raw: Record<string, unknown>): AgentEvent {
  const eventType = (raw.type as string) || 'unknown';
  const sessionId = extractSessionId(raw);
  const agent = (raw.tool as string) || (raw.command as string) || (raw.title as string) || 'opencode';

  return {
    id: (raw.id as string) || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    type: EVENT_TYPE_MAP[eventType] || 'message',
    agent,
    payload: raw,
    timestamp: Date.now(),
  };
}

/**
 * Parse SSE stream chunks into individual JSON events.
 * Handles SSE format: `data: {...}\n\n`
 * Handles wrapped events: `{ event: {...} }` or `{ payload: {...} }`
 */
function parseSSEChunk(chunk: string): Record<string, unknown>[] {
  const dataLines = chunk
    .split('\n')
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trim());

  if (!dataLines.length) return [];

  try {
    const raw = JSON.parse(dataLines.join('\n'));
    // Unwrap: OpenCode wraps events in {event: ...} or {payload: ...}
    const inner = raw.event ?? raw.payload ?? raw;
    return Array.isArray(inner) ? inner : [inner];
  } catch {
    return [];
  }
}

export interface Collector {
  connect(url: string, username: string, password: string): Promise<void>;
  disconnect(): void;
}

/**
 * Build SSE collector that feeds events into the store and optionally broadcasts them.
 * Includes automatic reconnection with exponential backoff.
 */
export function buildCollector(
  store: PluginStore,
  broadcaster?: (event: AgentEvent) => void,
): Collector {
  let abortController: AbortController | null = null;
  let running = false;

  async function connectWithRetry(
    url: string,
    username: string,
    password: string,
  ): Promise<void> {
    let backoff = 1000; // 1s initial
    const maxBackoff = 30000; // 30s cap

    while (running) {
      try {
        await streamEvents(url, username, password);
        // Stream ended normally — reconnect after short delay
        backoff = 1000;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        console.error(`[agent-flow] SSE connection error, retrying in ${backoff}ms:`, err);
      }

      if (!running) return;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, maxBackoff);
    }
  }

  async function streamEvents(
    url: string,
    username: string,
    password: string,
  ): Promise<void> {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const auth = Buffer.from(`${username}:${password}`).toString('base64');

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'text/event-stream',
      },
      signal: abortController.signal,
    });

    if (!res.ok || !res.body) {
      throw new Error(`SSE connection failed: HTTP ${res.status}`);
    }

    console.log(`[agent-flow] Connected to OpenCode SSE: ${url}`);

    const reader = (res.body as ReadableStream<Uint8Array>)
      .pipeThrough(new TextDecoderStream() as ReadableWritablePair<string, Uint8Array>)
      .getReader();

    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += value;
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';

        for (const chunk of chunks) {
          const events = parseSSEChunk(chunk);
          for (const raw of events) {
            try {
              const event = toAgentEvent(raw);
              await store.addEvent(event);
              broadcaster?.(event);
            } catch {
              // Skip malformed events — don't crash the stream
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function connect(url: string, username: string, password: string): Promise<void> {
    running = true;
    // Don't await — let it run in background
    connectWithRetry(url, username, password).catch((err) => {
      console.error('[agent-flow] Collector fatal error:', err);
    });
  }

  function disconnect(): void {
    running = false;
    abortController?.abort();
    abortController = null;
  }

  return { connect, disconnect };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
