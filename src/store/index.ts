import fs from 'fs';
import path from 'path';
import type { AgentEvent } from '../types.js';

const FLUSH_DELAY = 1000; // ms to wait before flushing after last addEvent
const FLUSH_MAX_EVENTS = 50; // flush also if buffer exceeds this count

export class PluginStore {
  private baseDir: string;
  private buffer = new Map<string, AgentEvent[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushScheduled = false;

  constructor(directory: string) {
    this.baseDir = path.join(directory, '.agent-flow', 'data');
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  /** Push event to in-memory buffer. Written to disk after debounce or on threshold. */
  async addEvent(event: AgentEvent): Promise<void> {
    const buf = this.buffer.get(event.sessionId) || [];
    buf.push(event);
    this.buffer.set(event.sessionId, buf);

    // Flush early if buffer exceeds threshold for this session
    if (buf.length >= FLUSH_MAX_EVENTS) {
      this.flushSession(event.sessionId);
      return;
    }

    // Schedule flush with debounce (resets timer on each addEvent)
    this.scheduleFlush();
  }

  /** Read events for a session. Flushes buffer first. */
  getEvents(sessionId: string, limit?: number): AgentEvent[] {
    this.flushAll();
    const filePath = path.join(this.baseDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const events: AgentEvent[] = data.events || [];
      return limit ? events.slice(-limit) : events;
    } catch {
      return [];
    }
  }

  /** List all session IDs (from disk) */
  getSessions(): string[] {
    this.flushAll();
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.replace('.json', ''));
  }

  /** Schedule a deferred flush (debounced: resets on each call) */
  private scheduleFlush(): void {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushAll();
    }, FLUSH_DELAY);
  }

  /** Flush a single session buffer to disk */
  private flushSession(sessionId: string): void {
    const buf = this.buffer.get(sessionId);
    if (!buf || buf.length === 0) return;

    const filePath = path.join(this.baseDir, `${sessionId}.json`);

    let data: { events: AgentEvent[] } = { events: [] };
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        data = { events: [] };
      }
    }

    for (const event of buf) {
      data.events.push(event);
    }
    this.buffer.delete(sessionId);

    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
  }

  /** Flush all session buffers to disk */
  private flushAll(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    for (const sessionId of this.buffer.keys()) {
      this.flushSession(sessionId);
    }
  }

  /** Close the store: flush remaining events, cancel pending timer */
  close(): void {
    this.flushAll();
  }
}
