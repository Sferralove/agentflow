export type EventType = 'start' | 'complete' | 'dispatch' | 'task' | 'error' | 'message';

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error';

export type AgentType = 'main' | 'subagent';

export interface AgentEvent {
  id: string;
  sessionId: string;
  type: EventType;
  agent: string;
  targetAgent?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface AgentInfo {
  id: string;
  name: string;
  type: AgentType;
  parentId?: string;
  children: string[];
  capabilities: string[];
  status: AgentStatus;
  sessionId: string;
  startedAt: number;
  completedAt?: number;
  tasksCompleted: number;
  tasksFailed: number;
}

export interface AgentNode extends AgentInfo {
  events: AgentEvent[];
}

export interface SessionData {
  id: string;
  agents: Map<string, AgentInfo>;
  events: AgentEvent[];
  startedAt: number;
}

export interface EventStore {
  addEvent(event: AgentEvent): Promise<void>;
  getEvents(filter?: EventFilter): Promise<AgentEvent[]>;
  getSession(sessionId: string): Promise<SessionData | null>;
  getAgentInfo(agentId: string): Promise<AgentInfo | null>;
  getAgentTree(sessionId: string): Promise<AgentNode[]>;
  getAllSessions(): Promise<string[]>;
}

export interface EventFilter {
  agent?: string;
  type?: EventType;
  sessionId?: string;
  from?: number;
  to?: number;
}

export interface WSMessage {
  type: 'event' | 'heartbeat' | 'ack';
  data?: AgentEvent | string;
  lastEventId?: string;
}
