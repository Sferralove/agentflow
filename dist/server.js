"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFlowServer = void 0;
const fs_1 = __importDefault(require("fs"));
const multi_store_1 = require("./store/multi-store");
const server_1 = require("./mcp/server");
const server_2 = require("./ws/server");
class AgentFlowServer {
    store;
    mcpServer;
    wsServer;
    dataDir;
    watcher = null;
    reloadTimer = null;
    constructor(dataDir, wsPort) {
        this.dataDir = dataDir;
        this.store = new multi_store_1.MultiStore(dataDir);
        this.wsServer = new server_2.AgentFlowWSServer(wsPort);
        // Wrap store.addEvent to trigger WS broadcast via monkey-patch
        // Broadcast FIRST (real-time), then persist asynchronously
        const originalAddEvent = this.store.addEvent.bind(this.store);
        this.store.addEvent = async (event) => {
            // Push to memory and persist (non-blocking for broadcast)
            const savePromise = originalAddEvent(event);
            // Broadcast immediately — don't wait for disk I/O
            this.wsServer.broadcast(event);
            await savePromise;
        };
        this.mcpServer = new server_1.AgentFlowMCPServer(this.store);
    }
    /** Watch data directory for external file changes (new sessions, direct disk writes) */
    startFileWatcher() {
        if (!fs_1.default.existsSync(this.dataDir)) {
            fs_1.default.mkdirSync(this.dataDir, { recursive: true });
        }
        this.watcher = fs_1.default.watch(this.dataDir, { persistent: false }, (_event, filename) => {
            // Only react to .json files (not .tmp)
            if (!filename || !filename.endsWith('.json') || filename.endsWith('.tmp'))
                return;
            // Debounce: multiple filesystem events in quick succession
            if (this.reloadTimer)
                clearTimeout(this.reloadTimer);
            this.reloadTimer = setTimeout(() => {
                const sessionId = filename.replace('.json', '');
                // Reload the file into memory
                this.store.reloadSession(sessionId);
                // Tell all clients to refresh
                this.wsServer.broadcast({ type: 'reload' });
            }, 200);
        });
    }
    async startMCP() {
        await this.mcpServer.start();
    }
    async startWS(httpServer) {
        await this.wsServer.start(httpServer);
    }
    async stop() {
        if (this.reloadTimer)
            clearTimeout(this.reloadTimer);
        if (this.watcher)
            this.watcher.close();
        try {
            await this.wsServer.stop();
        }
        catch { /* ignore */ }
        try {
            await this.mcpServer.stop();
        }
        catch { /* ignore */ }
    }
    getStore() {
        return this.store;
    }
}
exports.AgentFlowServer = AgentFlowServer;
//# sourceMappingURL=server.js.map