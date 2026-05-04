import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';

interface MessageInput {
  message?: {
    id: string;
    role: string;
    content?: string;
  };
}

export function createMessageHooks(store: PluginStore, container: PluginContainer) {
  return {
    'message.updated': async (input: unknown) => {
      const inp = input as MessageInput;
      if (!container.sessionId || !inp.message) return;

      if (inp.message.role !== 'assistant') return;
      if (container.loggedMessages.has(inp.message.id)) return;
      container.loggedMessages.add(inp.message.id);

      const content = inp.message.content || '';
      const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
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
