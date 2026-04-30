import type { Server } from 'http';
import { MultiStore } from './store/multi-store';
export declare class AgentFlowServer {
    private store;
    private mcpServer;
    private wsServer;
    constructor(dataDir: string, wsPort: number);
    startMCP(): Promise<void>;
    startWS(httpServer?: Server): Promise<void>;
    stop(): Promise<void>;
    getStore(): MultiStore;
}
//# sourceMappingURL=server.d.ts.map