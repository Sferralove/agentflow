import type { PluginStore } from './store/index.js';
import type { AgentEvent, EventType } from './types.js';

/**
 * Known SSE event types that carry agent-flow-relevant data.
 * Everything else is internal OpenCode noise and gets dropped.
 */
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

/** Throttle state for high-frequency events */
const throttleTimers = new Map<string, number>();
function isThrottled(key: string, minIntervalMs: number): boolean {
  const now = Date.now();
  const last = throttleTimers.get(key) || 0;
  if (now - last < minIntervalMs) return true;
  throttleTimers.set(key, now);
  return false;
}

/**
 * Decide if an event should be kept or dropped.
 * Returns AgentEvent if event passes filter, null if noise.
 */
function filterAndMap(raw: Record<string, unknown>): AgentEvent | null {
  const eventType = (raw.type as string) || '';

  // Drop unknown event types — they're internal OpenCode noise
  if (!EVENT_TYPE_MAP[eventType]) return null;

  // Throttle message.updated: max once per 2s per session (prevents streaming flood)
  if (eventType === 'message.updated') {
    const sessionId = extractSessionId(raw);
    if (isThrottled(`msg:${sessionId}`, 2000)) return null;
  }

  const sessionId = extractSessionId(raw);

  // Extract agent from event payload: tool/command (tool events) or properties.info.agent (session/message events)
  const props = raw.properties as Record<string, unknown> | undefined;
  const info = props?.info as Record<string, unknown> | undefined;
  const agent = (raw.tool as string)
    || (raw.command as string)
    || (raw.title as string)
    || (info?.agent as string)
    || 'opencode';

  // Extract parentID from SSE payload — OpenCode sets this for subagent sessions
  const parentId = (info?.parentID as string);

  return {
    id: (raw.id as string) || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    parentSessionId: parentId || undefined,
    type: EVENT_TYPE_MAP[eventType],
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
  connect(url: string, username?: string, password?: string): void;
  disconnect(): void;
}

/** Human-readable error message for common connection failures */
function connectErrorMsg(err: unknown): string {
  if (err instanceof Error) {
    if (err.message.includes('401') || err.message.includes('Unauthorized')) {
      return 'Authentication required. Set OPENCODE_SERVER_PASSWORD.';
    }
    const cause = (err as Error & { cause?: { code?: string } }).cause;
    const code = cause?.code || '';
    if (code === 'ECONNREFUSED' || err.message.includes('ECONNREFUSED')) {
      return 'OpenCode server not found. Run: opencode --port 4096';
    }
  }
  return 'Connection failed. Retrying...';
}

/**
 * Build SSE collector that feeds events into the store and optionally broadcasts them.
 * Auto-detects auth, auto-filters noise, auto-reconnects.
 */
export function buildCollector(
  store: PluginStore,
  broadcaster?: (event: AgentEvent) => void,
): Collector {
  let abortController: AbortController | null = null;
  let running = false;

  async function connectWithRetry(
    url: string,
    username: string | undefined,
    password: string | undefined,
  ): Promise<void> {
    let backoff = 1000;
    const maxBackoff = 30000;
    let authFailed = false;

    while (running) {
      try {
        await streamEvents(url, username, password);
        backoff = 1000;
        authFailed = false;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;

        const msg = connectErrorMsg(err);
        console.error(`[agent-flow] ${msg}`);

        if (msg.includes('Authentication required')) {
          if (!authFailed) {
            authFailed = true;
            console.error('[agent-flow] Set OPENCODE_SERVER_PASSWORD and restart.');
          }
          backoff = 30000;
        }
      }

      if (!running) return;
      await sleep(backoff);
      backoff = Math.min(backoff * 2, maxBackoff);
    }
  }

  async function streamEvents(
    url: string,
    username: string | undefined,
    password: string | undefined,
  ): Promise<void> {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const headers: Record<string, string> = {
      Accept: 'text/event-stream',
    };

    if (password) {
      const user = username || 'opencode';
      const auth = Buffer.from(`${user}:${password}`).toString('base64');
      headers.Authorization = `Basic ${auth}`;
    }

    const res = await fetch(url, {
      headers,
      signal: abortController.signal,
    });

    if (res.status === 401) {
      throw new Error('Unauthorized (401)');
    }
    if (!res.ok) {
      throw new Error(`SSE connection failed: HTTP ${res.status}`);
    }
    if (!res.body) {
      throw new Error('SSE response has no body');
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
              const event = filterAndMap(raw);
              if (event) {
                await store.addEvent(event);
                broadcaster?.(event);
              }
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

  function connect(url: string, username?: string, password?: string): void {
    running = true;
    throttleTimers.clear(); // Reset throttle on reconnect
    connectWithRetry(url, username, password).catch((err) => {
      console.error('[agent-flow] Collector fatal error:', err);
    });
  }

  function disconnect(): void {
    running = false;
    throttleTimers.clear();
    abortController?.abort();
    abortController = null;
  }

  return { connect, disconnect };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
