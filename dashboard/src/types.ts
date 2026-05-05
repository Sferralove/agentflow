// NOTE: AgentEvent and EventType mirror the backend types in src/types.ts.
// Keep in sync when the plugin event schema changes.
export type EventType = 'start' | 'complete' | 'dispatch' | 'delegation' | 'task' | 'error' | 'message';

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
