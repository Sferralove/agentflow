import type { Server } from 'http';
import { MultiStore } from './store/multi-store';
export declare class AgentFlowServer {
    private store;
    private mcpServer;
    private wsServer;
    private dataDir;
    private watcher;
    private reloadTimer;
    constructor(dataDir: string, wsPort: number);
    /** Watch data directory for external file changes (new sessions, direct disk writes) */
    startFileWatcher(): void;
    startMCP(): Promise<void>;
    startWS(httpServer?: Server): Promise<void>;
    stop(): Promise<void>;
    getStore(): MultiStore;
}
//# sourceMappingURL=server.d.ts.map