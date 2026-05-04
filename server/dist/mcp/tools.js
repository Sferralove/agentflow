"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMCPTools = createMCPTools;
const uuid_1 = require("uuid");
const zod_1 = require("zod");
const toolResponse = (data) => ({
    content: [{ type: 'text', text: JSON.stringify(data) }],
});
const errorResponse = (message) => ({
    content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
});
const VALID_EVENT_TYPES = ['start', 'complete', 'dispatch', 'task', 'error', 'message'];
function createMCPTools(store) {
    return {
        send_event: {
            name: 'send_event',
            description: 'Send an agent event to the flow monitor',
            inputSchema: {
                type: zod_1.z.enum(['start', 'complete', 'dispatch', 'delegation', 'task', 'error', 'message']),
                agent: zod_1.z.string(),
                sessionId: zod_1.z.string(),
                targetAgent: zod_1.z.string().optional(),
                payload: zod_1.z.record(zod_1.z.string(), zod_1.z.unknown()).optional(),
            },
            handler: async (args) => {
                try {
                    // Map 'delegation' → 'dispatch' for backward compat
                    const eventType = args.type === 'delegation' ? 'dispatch' : args.type;
                    if (!VALID_EVENT_TYPES.includes(eventType)) {
                        return errorResponse(`Invalid event type: ${eventType}`);
                    }
                    const event = {
                        id: (0, uuid_1.v4)(),
                        sessionId: args.sessionId,
                        type: eventType,
                        agent: args.agent,
                        targetAgent: args.targetAgent,
                        payload: args.payload || {},
                        timestamp: Date.now(),
                    };
                    await store.addEvent(event);
                    return toolResponse({ success: true, eventId: event.id });
                }
                catch (err) {
                    return errorResponse(`Failed to add event: ${err instanceof Error ? err.message : String(err)}`);
                }
            },
        },
        query_events: {
            name: 'query_events',
            description: 'Query events with optional filters',
            inputSchema: {
                agent: zod_1.z.string().optional(),
                type: zod_1.z.string().optional(),
                sessionId: zod_1.z.string().optional(),
                from: zod_1.z.number().optional(),
                to: zod_1.z.number().optional(),
            },
            handler: async (args) => {
                try {
                    const events = await store.getEvents({
                        agent: args.agent,
                        type: args.type,
                        sessionId: args.sessionId,
                        from: args.from,
                        to: args.to,
                    });
                    return toolResponse(events);
                }
                catch (err) {
                    return errorResponse(`Failed to query events: ${err instanceof Error ? err.message : String(err)}`);
                }
            },
        },
        get_session: {
            name: 'get_session',
            description: 'Get complete session data',
            inputSchema: {
                sessionId: zod_1.z.string(),
            },
            handler: async (args) => {
                try {
                    const session = await store.getSession(args.sessionId);
                    return toolResponse(session);
                }
                catch (err) {
                    return errorResponse(`Failed to get session: ${err instanceof Error ? err.message : String(err)}`);
                }
            },
        },
        get_agent_info: {
            name: 'get_agent_info',
            description: 'Get agent metadata',
            inputSchema: {
                agentId: zod_1.z.string(),
            },
            handler: async (args) => {
                try {
                    const agent = await store.getAgentInfo(args.agentId);
                    return toolResponse(agent);
                }
                catch (err) {
                    return errorResponse(`Failed to get agent info: ${err instanceof Error ? err.message : String(err)}`);
                }
            },
        },
        get_agent_tree: {
            name: 'get_agent_tree',
            description: 'Get agent hierarchy for a session',
            inputSchema: {
                sessionId: zod_1.z.string(),
            },
            handler: async (args) => {
                try {
                    const tree = await store.getAgentTree(args.sessionId);
                    return toolResponse(tree);
                }
                catch (err) {
                    return errorResponse(`Failed to get agent tree: ${err instanceof Error ? err.message : String(err)}`);
                }
            },
        },
    };
}
//# sourceMappingURL=tools.js.map