import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

export function createSessionHook(store: PluginStore, container: PluginContainer) {
  return {
    'session.created': async (input: unknown) => {
      const inp = input as { session?: { id: string; title?: string } };
      container.sessionId = inp.session?.id || ('session-' + Date.now());
      container.sessionStartedAt = Date.now();

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'start',
        agent: 'opencode',
        payload: {
          action: inp.session?.title || 'new-session',
          description: 'Session started',
        },
        timestamp: container.sessionStartedAt,
      };

      await store.addEvent(event);
    },

    'session.idle': async () => {
      if (!container.sessionId) return;

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'complete',
        agent: 'opencode',
        payload: {
          action: 'session-complete',
          description: 'All work completed',
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
      container.sessionId = null;
    },

    'session.error': async (input: unknown) => {
      if (!container.sessionId) return;
      const inp = input as { error?: { message?: string } };

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
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
