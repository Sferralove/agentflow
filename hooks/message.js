import { getCurrentSessionId } from './session.js';
function generateId() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
export function createMessageHooks(store) {
    const loggedMessages = new Set();
    return {
        /** Fires when a message is updated (agent response received) */
        'message.updated': async (input) => {
            const inp = input;
            const sessionId = getCurrentSessionId();
            if (!sessionId || !inp.message)
                return;
            // Only log assistant messages once per ID
            if (inp.message.role !== 'assistant')
                return;
            if (loggedMessages.has(inp.message.id))
                return;
            loggedMessages.add(inp.message.id);
            const content = inp.message.content || '';
            const preview = content.length > 300 ? content.slice(0, 300) + '...' : content;
            const event = {
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
