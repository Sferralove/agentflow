import fs from 'fs';
import path from 'path';
import type { AgentEvent } from '../types.js';

export class PluginStore {
  private baseDir: string;

  constructor(directory: string) {
    this.baseDir = path.join(directory, '.agent-flow', 'data');
  }

  /** Write a single event to the session file */
  async addEvent(event: AgentEvent): Promise<void> {
    const filePath = path.join(this.baseDir, `${event.sessionId}.json`);

    // Ensure directory exists
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }

    // Read existing data or create new
    let data: { events: AgentEvent[] } = { events: [] };
    if (fs.existsSync(filePath)) {
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } catch {
        data = { events: [] };
      }
    }

    // Append event
    data.events.push(event);

    // Atomic write with restrictive permissions: tmp file then rename
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), { mode: 0o600 });
    fs.renameSync(tmpPath, filePath);
    fs.chmodSync(filePath, 0o600);
  }

  /** Read all events for a session */
  getEvents(sessionId: string): AgentEvent[] {
    const filePath = path.join(this.baseDir, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return data.events || [];
    } catch {
      return [];
    }
  }

  /** List all session IDs */
  getSessions(): string[] {
    if (!fs.existsSync(this.baseDir)) return [];
    return fs.readdirSync(this.baseDir)
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.replace('.json', ''));
  }
}
