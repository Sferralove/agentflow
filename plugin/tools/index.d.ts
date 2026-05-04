import type { PluginStore } from '../store/index.js';
/** Custom tools exposed by the plugin — agents can query the monitor directly */
export declare function createTools(store: PluginStore): {
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
