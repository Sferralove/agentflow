export type EventType = 'start' | 'complete' | 'dispatch' | 'task' | 'error' | 'message';

export interface AgentEvent {
  id: string;
  sessionId: string;
  type: EventType;
  agent: string;
  targetAgent?: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

export interface DashboardConfig {
  port: number;
  host: string;
}

export type EventBroadcaster = (event: AgentEvent) => void;
