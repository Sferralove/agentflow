import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';

let currentSessionId: string | null = null;
let sessionStartedAt: number = 0;

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createSessionHook(store: PluginStore) {
  return {
    /** Fires when a new session is created */
    'session.created': async (input: unknown) => {
      const inp = input as { session?: { id: string; title?: string } };
      currentSessionId = inp.session?.id || ('session-' + Date.now());
      sessionStartedAt = Date.now();

      const event: AgentEvent = {
        id: generateId(),
        sessionId: currentSessionId,
        type: 'start',
        agent: 'opencode',
        payload: {
          action: inp.session?.title || 'new-session',
          description: 'Session started',
        },
        timestamp: sessionStartedAt,
      };

      await store.addEvent(event);
    },

    /** Fires when session becomes idle (all work done) */
    'session.idle': async () => {
      if (!currentSessionId) return;

      const event: AgentEvent = {
        id: generateId(),
        sessionId: currentSessionId,
        type: 'complete',
        agent: 'opencode',
        payload: {
          action: 'session-complete',
          description: 'All work completed',
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
      currentSessionId = null;
    },

    /** Fires on session error */
    'session.error': async (input: unknown) => {
      if (!currentSessionId) return;
      const inp = input as { error?: { message?: string } };

      const event: AgentEvent = {
        id: generateId(),
        sessionId: currentSessionId,
        type: 'error',
        agent: 'opencode',
        payload: {
          description: inp.error?.message || 'Session error',
          error: inp.error,
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
    },
  };
}

/** Get current session ID (for other hooks to use) */
export function getCurrentSessionId(): string | null {
  return currentSessionId;
}
