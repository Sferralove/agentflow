export type EventType = 'start' | 'complete' | 'dispatch' | 'task' | 'error' | 'message';

export interface AgentEvent {
  id: string;
  sessionId: string;
  type: EventType;
  agent: string;
  targetAgent?: string;
  payload: {
    action?: string;
    description?: string;
    duration?: number;
    args?: Record<string, unknown>;
    result?: string;
    error?: unknown;
    reason?: string;
    messageId?: string;
    contentLength?: number;
  };
  timestamp: number;
}

export interface WSMessage {
  type: 'event' | 'sessionList';
  event?: AgentEvent;
  sessions?: string[];
}
