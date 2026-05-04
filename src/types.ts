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

export interface PluginContext {
  project: { name?: string };
  client: { app: { log: (opts: { body: Record<string, unknown> }) => Promise<void> } };
  $: { [cmd: string]: unknown };
  directory: string;
  worktree?: string;
}

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

export interface DashboardConfig {
  port: number;
  host: string;
  autoOpen: boolean;
}

export type EventBroadcaster = (event: AgentEvent) => void;
