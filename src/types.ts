export type EventType = 'start' | 'complete' | 'dispatch' | 'delegation' | 'task' | 'error' | 'message';

export interface AgentEvent {
  id: string;
  sessionId: string;
  parentSessionId?: string;
  type: EventType;
  agent: string;
  targetAgent?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface SessionTree {
  id: string;
  children: string[];
}

export interface DashboardConfig {
  port: number;
  host: string;
}

export type EventBroadcaster = (event: AgentEvent) => void;
