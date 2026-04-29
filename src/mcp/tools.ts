import { v4 as uuidv4 } from 'uuid';
import type { EventStore, AgentEvent, EventType } from '../types';

const toolResponse = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data) }],
});

const errorResponse = (message: string) => ({
  content: [{ type: 'text' as const, text: JSON.stringify({ error: message }) }],
});

const VALID_EVENT_TYPES: EventType[] = ['start', 'complete', 'dispatch', 'task', 'error', 'message'];

export function createMCPTools(store: EventStore) {
  return {
    send_event: {
      name: 'send_event' as const,
      description: 'Send an agent event to the flow monitor',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['start', 'complete', 'dispatch', 'task', 'error', 'message'] },
          agent: { type: 'string' },
          sessionId: { type: 'string' },
          targetAgent: { type: 'string' },
          payload: { type: 'object' },
        },
        required: ['type', 'agent', 'sessionId'],
      },
      handler: async (args: { type: string; agent: string; sessionId: string; targetAgent?: string; payload?: Record<string, unknown> }) => {
        try {
          if (!VALID_EVENT_TYPES.includes(args.type as EventType)) {
            return errorResponse(`Invalid event type: ${args.type}`);
          }
          const event: AgentEvent = {
            id: uuidv4(),
            sessionId: args.sessionId,
            type: args.type as EventType,
            agent: args.agent,
            targetAgent: args.targetAgent,
            payload: args.payload || {},
            timestamp: Date.now(),
          };
          await store.addEvent(event);
          return toolResponse({ success: true, eventId: event.id });
        } catch (err) {
          return errorResponse(`Failed to add event: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },

    query_events: {
      name: 'query_events' as const,
      description: 'Query events with optional filters',
      inputSchema: {
        type: 'object',
        properties: {
          agent: { type: 'string' },
          type: { type: 'string' },
          sessionId: { type: 'string' },
          from: { type: 'number' },
          to: { type: 'number' },
        },
      },
      handler: async (args: { agent?: string; type?: string; sessionId?: string; from?: number; to?: number }) => {
        try {
          const events = await store.getEvents({
            agent: args.agent,
            type: args.type as EventType | undefined,
            sessionId: args.sessionId,
            from: args.from,
            to: args.to,
          });
          return toolResponse(events);
        } catch (err) {
          return errorResponse(`Failed to query events: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },

    get_session: {
      name: 'get_session' as const,
      description: 'Get complete session data',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
        required: ['sessionId'],
      },
      handler: async (args: { sessionId: string }) => {
        try {
          const session = await store.getSession(args.sessionId);
          return toolResponse(session);
        } catch (err) {
          return errorResponse(`Failed to get session: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },

    get_agent_info: {
      name: 'get_agent_info' as const,
      description: 'Get agent metadata',
      inputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string' },
        },
        required: ['agentId'],
      },
      handler: async (args: { agentId: string }) => {
        try {
          const agent = await store.getAgentInfo(args.agentId);
          return toolResponse(agent);
        } catch (err) {
          return errorResponse(`Failed to get agent info: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },

    get_agent_tree: {
      name: 'get_agent_tree' as const,
      description: 'Get agent hierarchy for a session',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string' },
        },
        required: ['sessionId'],
      },
      handler: async (args: { sessionId: string }) => {
        try {
          const tree = await store.getAgentTree(args.sessionId);
          return toolResponse(tree);
        } catch (err) {
          return errorResponse(`Failed to get agent tree: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    },
  };
}
