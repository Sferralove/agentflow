/**
 * Agent Flow Plugin — automatic OpenCode monitoring
 *
 * Hooks into OpenCode events to capture ALL agent activity without
 * requiring explicit cooperation from agents. Writes to .agent-flow/data/
 * for the existing dashboard to visualize.
 *
 * Usage:
 *   1. Add "agent-flow-plugin" to opencode.json plugin array
 *   2. Run "npx agent-flow serve" for the dashboard
 *   3. Everything auto-logged — agents don't need to know
 */
export declare const AgentFlowPlugin: ({ directory }: {
    directory: string;
}) => Promise<{
    tool: {
        agentflow_events: {
            description: string;
            args: {
                sessionId: {
                    type: string;
                    description: string;
                };
                limit: {
                    type: string;
                    description: string;
                };
            };
            execute(args: {
                sessionId?: string;
                limit?: number;
            }): Promise<string>;
        };
        agentflow_sessions: {
            description: string;
            args: {};
            execute(): Promise<string>;
        };
        agentflow_stats: {
            description: string;
            args: {
                sessionId: {
                    type: string;
                    description: string;
                };
            };
            execute(args: {
                sessionId?: string;
            }): Promise<string>;
        };
    };
    'message.updated': (input: unknown) => Promise<void>;
    'tool.execute.before': (input: unknown) => Promise<void>;
    'tool.execute.after': (input: unknown, output: unknown) => Promise<void>;
    'session.created': (input: unknown) => Promise<void>;
    'session.idle': () => Promise<void>;
    'session.error': (input: unknown) => Promise<void>;
}>;
