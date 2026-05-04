import type { AgentEvent } from '../types.js';
import type { PluginStore } from '../store/index.js';
import type { PluginContainer } from '../plugin-container.js';
import { generateId } from '../util/id.js';
import { isMessageInput } from '../util/guards.js';

export function createMessageHooks(store: PluginStore, container: PluginContainer) {
  return {
    'message.updated': async (input: unknown) => {
      if (!isMessageInput(input)) return;
      if (!container.sessionId || !input.message) return;

      const msg = input.message;
      if (msg.role !== 'assistant') return;
      if (container.loggedMessages.has(msg.id)) return;
      container.loggedMessages.add(msg.id);

      const content = msg.content || '';
      const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;

      const event: AgentEvent = {
        id: generateId(),
        sessionId: container.sessionId,
        type: 'message',
        agent: 'opencode',
        payload: {
          action: 'response',
          description: preview,
          messageId: msg.id,
          contentLength: content.length,
        },
        timestamp: Date.now(),
      };

      await store.addEvent(event);
    },
  };
}
