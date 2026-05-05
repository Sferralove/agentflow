import { tool as defineTool } from '@opencode-ai/plugin';
import type { PluginStore } from '../store/index.js';

const z: typeof defineTool.schema = defineTool.schema;

interface EventsArgs {
  sessionId?: string;
  limit?: number;
}

interface StatsArgs {
  sessionId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createTools(store: PluginStore): any {
  return {
    agentflow_events: defineTool({
      description: 'Query agent-flow events for a session',
      args: {
        sessionId: z.string().optional().describe('Session ID (optional)'),
        limit: z.number().optional().describe('Max events (default 50)'),
      },
      async execute(args: EventsArgs) {
        const sessionId = args.sessionId;
        const limit = args.limit || 50;

        if (!sessionId) {
          const sessions = store.getSessions();
          const allEvents = sessions.flatMap(s => store.getEvents(s))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
          return JSON.stringify(allEvents, null, 2);
        }

        const events = store.getEvents(sessionId).slice(-limit);
        return JSON.stringify(events, null, 2);
      },
    }),

    agentflow_sessions: defineTool({
      description: 'List all monitored agent-flow sessions',
      args: {},
      async execute() {
        const sessions = store.getSessions();
        return JSON.stringify({ sessions, count: sessions.length }, null, 2);
      },
    }),

    agentflow_stats: defineTool({
      description: 'Get agent-flow monitoring statistics',
      args: {
        sessionId: z.string().optional().describe('Session ID (optional)'),
      },
      async execute(args: StatsArgs) {
        const sessionId = args.sessionId;
        const events = sessionId
          ? store.getEvents(sessionId)
          : store.getSessions().flatMap(s => store.getEvents(s));

        const byType: Record<string, number> = {};
        const byAgent: Record<string, number> = {};
        let errors = 0;

        for (const e of events) {
          byType[e.type] = (byType[e.type] || 0) + 1;
          byAgent[e.agent] = (byAgent[e.agent] || 0) + 1;
          if (e.type === 'error') errors++;
        }

        return JSON.stringify({
          total: events.length,
          errors,
          byType,
          byAgent,
          firstEvent: events[0]?.timestamp,
          lastEvent: events[events.length - 1]?.timestamp,
        }, null, 2);
      },
    }),
  };
}
