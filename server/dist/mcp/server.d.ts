import type { EventStore } from '../types';
export declare class AgentFlowMCPServer {
    private server;
    private store;
    constructor(store: EventStore);
    private registerTools;
    start(): Promise<void>;
    stop(): Promise<void>;
}
//# sourceMappingURL=server.d.ts.map