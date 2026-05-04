import { z } from 'zod';
import type { EventStore } from '../types';
export declare function createMCPTools(store: EventStore): {
    send_event: {
        name: "send_event";
        description: string;
        inputSchema: {
            type: z.ZodEnum<{
                start: "start";
                complete: "complete";
                dispatch: "dispatch";
                task: "task";
                error: "error";
                message: "message";
                delegation: "delegation";
            }>;
            agent: z.ZodString;
            sessionId: z.ZodString;
            targetAgent: z.ZodOptional<z.ZodString>;
            payload: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
        };
        handler: (args: {
            type: string;
            agent: string;
            sessionId: string;
            targetAgent?: string;
            payload?: Record<string, unknown>;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    query_events: {
        name: "query_events";
        description: string;
        inputSchema: {
            agent: z.ZodOptional<z.ZodString>;
            type: z.ZodOptional<z.ZodString>;
            sessionId: z.ZodOptional<z.ZodString>;
            from: z.ZodOptional<z.ZodNumber>;
            to: z.ZodOptional<z.ZodNumber>;
        };
        handler: (args: {
            agent?: string;
            type?: string;
            sessionId?: string;
            from?: number;
            to?: number;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    get_session: {
        name: "get_session";
        description: string;
        inputSchema: {
            sessionId: z.ZodString;
        };
        handler: (args: {
            sessionId: string;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    get_agent_info: {
        name: "get_agent_info";
        description: string;
        inputSchema: {
            agentId: z.ZodString;
        };
        handler: (args: {
            agentId: string;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
    get_agent_tree: {
        name: "get_agent_tree";
        description: string;
        inputSchema: {
            sessionId: z.ZodString;
        };
        handler: (args: {
            sessionId: string;
        }) => Promise<{
            content: {
                type: "text";
                text: string;
            }[];
        }>;
    };
};
//# sourceMappingURL=tools.d.ts.map