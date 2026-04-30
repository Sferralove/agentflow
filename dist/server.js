"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFlowServer = void 0;
const multi_store_1 = require("./store/multi-store");
const server_1 = require("./mcp/server");
const server_2 = require("./ws/server");
class AgentFlowServer {
    store;
    mcpServer;
    wsServer;
    constructor(dataDir, wsPort) {
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
    async startMCP() {
        await this.mcpServer.start();
    }
    async startWS(httpServer) {
        await this.wsServer.start(httpServer);
    }
    async stop() {
        await this.wsServer.stop();
        await this.mcpServer.stop();
    }
    getStore() {
        return this.store;
    }
}
exports.AgentFlowServer = AgentFlowServer;
//# sourceMappingURL=server.js.map