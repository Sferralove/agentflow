import type { AgentEvent, EventBroadcaster } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

export interface SdkEvent {
  type: string;
  properties?: Record<string, unknown>;
  session?: { id?: string; title?: string };
  sessionID?: string;
  error?: { message?: string };
  message?: { id: string; role: string; content?: string };
}

export function createEventHooks(store: PluginStore, container: PluginContainer, broadcast?: EventBroadcaster) {
  return {
    event: async (input: { event: SdkEvent }) => {
      if (!input?.event) return;
      const ev = input.event;

      switch (ev.type) {
        case 'session.created': {
          const title = ev.properties?.title as string | undefined;
          const sessionId = (ev.properties?.sessionID as string) || (ev.session?.id) || ('session-' + Date.now());
          container.sessionId = sessionId;
          container.sessionStartedAt = Date.now();

          const event: AgentEvent = {
            id: generateId(),
            sessionId,
            type: 'start',
            agent: 'opencode',
            payload: {
              action: title || 'new-session',
              description: 'Session started',
            },
            timestamp: container.sessionStartedAt,
          };
          await store.addEvent(event);
          broadcast?.(event);
          break;
        }

        case 'session.idle': {
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
          broadcast?.(event);
          container.sessionId = null;
          break;
        }

        case 'session.error': {
          if (!container.sessionId) return;
          const event: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'error',
            agent: 'opencode',
            payload: {
              description: ev.error?.message || 'Session error',
              error: ev.error ? { message: ev.error.message } : undefined,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(event);
          broadcast?.(event);
          break;
        }

        case 'message.updated': {
          if (!container.sessionId || !ev.message) return;
          if (ev.message.role !== 'assistant') return;
          if (container.loggedMessages.has(ev.message.id)) return;
          container.loggedMessages.add(ev.message.id);

          const content = ev.message.content || '';
          const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

          const event: AgentEvent = {
            id: generateId(),
            sessionId: container.sessionId,
            type: 'message',
            agent: 'opencode',
            payload: {
              action: 'response',
              description: preview,
              messageId: ev.message.id,
              contentLength: content.length,
            },
            timestamp: Date.now(),
          };
          await store.addEvent(event);
          broadcast?.(event);
          break;
        }
      }
    },
  };
}
