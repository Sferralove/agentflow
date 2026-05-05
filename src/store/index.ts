import fs from 'fs';
import path from 'path';
import type { AgentEvent, SessionTree } from '../types.js';

const FLUSH_DELAY = 1000; // ms to wait before flushing after last addEvent
const FLUSH_MAX_EVENTS = 50; // flush also if buffer exceeds this count

export class PluginStore {
  private baseDir: string;
  private buffer = new Map<string, AgentEvent[]>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushScheduled = false;
  /** Child -> Parent session mapping. Rebuilt on startup from events. */
  private parentMap = new Map<string, string>();

  constructor(directory: string) {
    this.baseDir = path.join(directory, '.agent-flow', 'data');
    fs.mkdirSync(this.baseDir, { recursive: true });
    this.rebuildParentMap();
  }

  /** Scan existing session files to rebuild parent-child relationships */
  private rebuildParentMap(): void {
    const sessions = this.listSessionFiles();
    for (const sessionId of sessions) {
      const events = this.readEventsFromDisk(sessionId);
      for (const event of events) {
        if (event.parentSessionId) {
          this.parentMap.set(sessionId, event.parentSessionId);
          break; // Found parent for this session, move on
        }
      }
    }
  }

  /** Return root sessions (no parent) and their children, sorted by most recent event */
  getSessionTree(): SessionTree[] {
    this.flushAll();
    const allSessions = this.listSessionFiles();
    const children = new Set(this.parentMap.keys());
    const roots = allSessions.filter(s => !children.has(s));

    // Get last event timestamp for a session
    const lastTimestamp = (sid: string): number => {
      const events = this.readEventsFromDisk(sid);
      return events.length > 0 ? events[events.length - 1].timestamp : 0;
    };

    // Sort roots by most recent event (descending)
    roots.sort((a, b) => lastTimestamp(b) - lastTimestamp(a));

    return roots.map(id => ({
      id,
      children: allSessions
        .filter(s => this.parentMap.get(s) === id)
        .sort((a, b) => lastTimestamp(b) - lastTimestamp(a)),
    }));
  }

  /** Check if childSessionId is a descendant of (or equals) parentSessionId */
  isChildOf(childSessionId: string, parentSessionId: string): boolean {
    if (childSessionId === parentSessionId) return true;
    const directParent = this.parentMap.get(childSessionId);
    if (!directParent) return false;
    return this.isChildOf(directParent, parentSessionId);
  }

  /** List session files on disk (excludes .tmp) */
  private listSessionFiles(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.replace('.json', ''));
  }

  /** Push event to in-memory buffer. Written to disk after debounce or on threshold. */
  async addEvent(event: AgentEvent): Promise<void> {
    // Track parent-child relationship
    if (event.parentSessionId) {
      this.parentMap.set(event.sessionId, event.parentSessionId);
    }

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

  /** Read events for a session from disk (raw, no flush) */
  private readEventsFromDisk(sessionId: string): AgentEvent[] {
    const filePath = path.join(this.baseDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.events || [];
    } catch {
      return [];
    }
  }

  /** Read events for a session. Flushes buffer first. Optionally includes child session events. */
  getEvents(sessionId: string, limit?: number, includeChildren?: boolean): AgentEvent[] {
    this.flushAll();
    const allEvents: AgentEvent[] = [];

    // Collect session IDs to read
    const targets = [sessionId];
    if (includeChildren) {
      const tree = this.getSessionTree();
      const node = tree.find(n => n.id === sessionId);
      if (node) targets.push(...node.children);
    }

    // Read events from each target session
    for (const sid of targets) {
      const events = this.readEventsFromDisk(sid);
      allEvents.push(...events);
    }

    // Sort by timestamp
    allEvents.sort((a, b) => a.timestamp - b.timestamp);

    return limit ? allEvents.slice(-limit) : allEvents;
  }

  /** List root session IDs (no parent) */
  getSessions(): string[] {
    this.flushAll();
    const allSessions = this.listSessionFiles();
    const children = new Set(this.parentMap.keys());
    return allSessions.filter(s => !children.has(s));
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
