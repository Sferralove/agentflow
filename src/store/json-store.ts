import fs from 'fs';
import path from 'path';
import type { AgentEvent, AgentInfo, AgentNode, EventFilter, EventStore, SessionData } from '../types';

export class JsonStore implements EventStore {
  private filePath: string;
  private events: AgentEvent[] = [];
  private agents: Map<string, AgentInfo> = new Map();

  constructor(filePath: string) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.filePath)) {
      try {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(data);
        this.events = parsed.events || [];
        this.agents = new Map(Object.entries(parsed.agents || {}).map(([k, v]) => [k, v as AgentInfo]));
      } catch {
        this.events = [];
        this.agents = new Map();
      }
    }
  }

  private async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const data = {
      events: this.events,
      agents: Object.fromEntries(this.agents),
    };
    const tmpPath = this.filePath + '.tmp';
    await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2));
    await fs.promises.rename(tmpPath, this.filePath);
  }

  async addEvent(event: AgentEvent): Promise<void> {
    this.events.push(event);
    this.updateAgentFromEvent(event);
    await this.save();
  }

  private updateAgentFromEvent(event: AgentEvent): void {
    let agent = this.agents.get(event.agent);

    if (!agent) {
      agent = {
        id: event.agent,
        name: event.agent,
        type: 'main' as const,
        children: [],
        capabilities: [],
        status: 'idle',
        sessionId: event.sessionId,
        startedAt: event.timestamp,
        tasksCompleted: 0,
        tasksFailed: 0,
      };
      this.agents.set(event.agent, agent);
    }

    switch (event.type) {
      case 'start':
        agent.status = 'running';
        agent.startedAt = event.timestamp;
        break;
      case 'complete':
        agent.status = 'completed';
        agent.completedAt = event.timestamp;
        agent.tasksCompleted++;
        break;
      case 'dispatch':
        if (event.targetAgent) {
          if (!agent.children.includes(event.targetAgent)) {
            agent.children.push(event.targetAgent);
          }
          let child = this.agents.get(event.targetAgent);
          if (!child) {
            child = {
              id: event.targetAgent,
              name: event.targetAgent,
              type: 'subagent' as const,
              children: [],
              capabilities: [],
              status: 'idle',
              sessionId: event.sessionId,
              parentId: event.agent,
              startedAt: event.timestamp,
              tasksCompleted: 0,
              tasksFailed: 0,
            };
            this.agents.set(event.targetAgent, child);
          } else {
            child.parentId = event.agent;
            child.type = 'subagent';
          }
        }
        break;
      case 'error':
        agent.status = 'error';
        agent.tasksFailed++;
        break;
      case 'task':
      case 'message':
        // No state change for task/message events
        break;
      default:
        // Unknown event type, ignore
        break;
    }
  }

  async getEvents(filter?: EventFilter): Promise<AgentEvent[]> {
    let result = this.events;

    if (filter) {
      if (filter.agent) {
        result = result.filter(e => e.agent === filter.agent);
      }
      if (filter.type) {
        result = result.filter(e => e.type === filter.type);
      }
      if (filter.sessionId) {
        result = result.filter(e => e.sessionId === filter.sessionId);
      }
      if (filter.from) {
        result = result.filter(e => e.timestamp >= filter.from);
      }
      if (filter.to) {
        result = result.filter(e => e.timestamp <= filter.to);
      }
    }

    return [...result];
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const events = this.events.filter(e => e.sessionId === sessionId);
    if (events.length === 0) return null;

    const agents = new Map<string, AgentInfo>();
    for (const event of events) {
      const agent = this.agents.get(event.agent);
      if (agent && !agents.has(event.agent)) {
        agents.set(event.agent, { ...agent });
      }
      // Include child agents created via dispatch
      if (event.targetAgent) {
        const child = this.agents.get(event.targetAgent);
        if (child && !agents.has(event.targetAgent)) {
          agents.set(event.targetAgent, { ...child });
        }
      }
    }

    return {
      id: sessionId,
      agents,
      events,
      startedAt: events[0]?.timestamp || Date.now(),
    };
  }

  async getAgentInfo(agentId: string): Promise<AgentInfo | null> {
    return this.agents.get(agentId) || null;
  }

  async getAgentTree(sessionId: string): Promise<AgentNode[]> {
    const session = await this.getSession(sessionId);
    if (!session) return [];

    return Array.from(session.agents.values()).map(agent => ({
      ...agent,
      events: session.events.filter(e => e.agent === agent.id),
    }));
  }

  async getAllSessions(): Promise<string[]> {
    const sessions = new Set<string>();
    for (const event of this.events) {
      sessions.add(event.sessionId);
    }
    return Array.from(sessions);
  }
}
