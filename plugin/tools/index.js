/** Custom tools exposed by the plugin — agents can query the monitor directly */
export function createTools(store) {
    return {
        'agentflow_events': {
            description: 'Query agent-flow events for a session. Returns events from the monitoring store.',
            args: {
                sessionId: { type: 'string', description: 'Session ID to query (optional, defaults to current session)' },
                limit: { type: 'number', description: 'Max events to return (default 50)' },
            },
            async execute(args) {
                const sessionId = args.sessionId;
                const limit = args.limit || 50;
                if (!sessionId) {
                    // Return recent events from all sessions
                    const sessions = store.getSessions();
                    const allEvents = sessions.flatMap(s => store.getEvents(s))
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .slice(0, limit);
                    return JSON.stringify(allEvents, null, 2);
                }
                const events = store.getEvents(sessionId).slice(-limit);
                return JSON.stringify(events, null, 2);
            },
        },
        'agentflow_sessions': {
            description: 'List all monitored agent-flow sessions',
            args: {},
            async execute() {
                const sessions = store.getSessions();
                return JSON.stringify({ sessions, count: sessions.length }, null, 2);
            },
        },
        'agentflow_stats': {
            description: 'Get statistics for the current agent-flow monitoring',
            args: {
                sessionId: { type: 'string', description: 'Session ID (optional, defaults to all sessions)' },
            },
            async execute(args) {
                const sessionId = args.sessionId;
                const events = sessionId
                    ? store.getEvents(sessionId)
                    : store.getSessions().flatMap(s => store.getEvents(s));
                const byType = {};
                const byAgent = {};
                let errors = 0;
                for (const e of events) {
                    byType[e.type] = (byType[e.type] || 0) + 1;
                    byAgent[e.agent] = (byAgent[e.agent] || 0) + 1;
                    if (e.type === 'error')
                        errors++;
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
        },
    };
}
