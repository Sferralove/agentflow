import fs from 'fs';
import path from 'path';
import { JsonStore } from './json-store';
import type { AgentEvent, AgentInfo, AgentNode, EventFilter, EventStore, SessionData } from '../types';

export class MultiStore implements EventStore {
  private dataDir: string;
  private stores: Map<string, JsonStore> = new Map();

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }

  private getStore(sessionId: string): JsonStore {
    if (!this.stores.has(sessionId)) {
      const filePath = path.join(this.dataDir, `${sessionId}.json`);
      this.stores.set(sessionId, new JsonStore(filePath));
    }
    return this.stores.get(sessionId)!;
  }

  async addEvent(event: AgentEvent): Promise<void> {
    await this.getStore(event.sessionId).addEvent(event);
  }

  async getEvents(filter?: EventFilter): Promise<AgentEvent[]> {
    // If session filter, query only that session
    if (filter?.sessionId) {
      return this.getStore(filter.sessionId).getEvents(filter);
    }
    // Otherwise merge all sessions
    const all: AgentEvent[] = [];
    for (const sessionId of await this.getAllSessions()) {
      const events = await this.getStore(sessionId).getEvents(filter);
      all.push(...events);
    }
    return all.sort((a, b) => a.timestamp - b.timestamp);
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    return this.getStore(sessionId).getSession(sessionId);
  }

  async getAgentInfo(agentId: string): Promise<AgentInfo | null> {
    for (const sessionId of await this.getAllSessions()) {
      const info = await this.getStore(sessionId).getAgentInfo(agentId);
      if (info) return info;
    }
    return null;
  }

  async getAgentTree(sessionId: string): Promise<AgentNode[]> {
    return this.getStore(sessionId).getAgentTree(sessionId);
  }

  async getAllSessions(): Promise<string[]> {
    if (!fs.existsSync(this.dataDir)) return [];
    const files = fs.readdirSync(this.dataDir);
    return files
      .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
      .map(f => f.replace('.json', ''));
  }
}
