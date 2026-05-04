import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import { getCurrentSessionId } from './session.js';

function generateId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

interface MessageInput {
  message?: {
    id: string;
    role: string;
    content?: string;
  };
}

export function createMessageHooks(store: PluginStore) {
  const loggedMessages = new Set<string>();

  return {
    /** Fires when a message is updated (agent response received) */
    'message.updated': async (input: unknown) => {
      const inp = input as MessageInput;
      const sessionId = getCurrentSessionId();
      if (!sessionId || !inp.message) return;

      // Only log assistant messages once per ID
      if (inp.message.role !== 'assistant') return;
      if (loggedMessages.has(inp.message.id)) return;
      loggedMessages.add(inp.message.id);

      const content = inp.message.content || '';
      const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

      const event: AgentEvent = {
        id: generateId(),
        sessionId,
        type: 'message',
        agent: 'opencode',
        payload: {
          action: 'response',
          description: preview,
          messageId: inp.message.id,
          contentLength: content.length,
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
    },
  };
}
