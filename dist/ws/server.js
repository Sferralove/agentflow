"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFlowWSServer = void 0;
const ws_1 = require("ws");
class AgentFlowWSServer {
    wss = null;
    port;
    heartbeatIntervalMs;
    heartbeatInterval = null;
    onEventCallback;
    constructor(port, heartbeatIntervalMs = 30000) {
        this.port = port;
        this.heartbeatIntervalMs = heartbeatIntervalMs;
    }
    setEventCallback(callback) {
        this.onEventCallback = callback;
    }
    async start(httpServer) {
        return new Promise((resolve, reject) => {
            // Attach to existing HTTP server, or create standalone
            this.wss = new ws_1.WebSocketServer(httpServer ? { server: httpServer } : { port: this.port });
            this.wss.on('connection', (ws) => {
                this.handleConnection(ws);
            });
            this.wss.on('error', (err) => {
                console.error('WebSocket server error:', err);
                reject(err);
            });
            this.wss.on('listening', () => {
                console.log(`WebSocket attached${httpServer ? '' : ` on port ${this.port}`}`);
                resolve();
                this.startHeartbeat();
            });
            // If attached to existing server, resolve immediately
            if (httpServer) {
                // WebSocketServer with {server} doesn't emit 'listening', so resolve now
                resolve();
                this.startHeartbeat();
            }
        });
    }
    async stop() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.wss) {
            await new Promise((resolve) => {
                this.wss.close(() => resolve());
            });
            this.wss = null;
        }
    }
    handleConnection(ws) {
        ws.on('message', (data) => {
            this.handleMessage(ws, data.toString());
        });
        ws.on('error', (err) => {
            console.error('WebSocket client error:', err);
        });
        ws.on('close', () => {
            console.log('Client disconnected');
        });
    }
    handleMessage(ws, data) {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'ack') {
                // Acknowledgment received
            }
        }
        catch {
            // Invalid message, ignore
        }
    }
    broadcast(event) {
        if (!this.wss)
            return;
        const message = {
            type: 'event',
            data: event,
        };
        const payload = JSON.stringify(message);
        this.wss.clients.forEach((client) => {
            if (client.readyState === ws_1.WebSocket.OPEN) {
                client.send(payload);
            }
        });
    }
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (!this.wss)
                return;
            const message = { type: 'heartbeat' };
            const payload = JSON.stringify(message);
            this.wss.clients.forEach((client) => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(payload);
                }
            });
        }, this.heartbeatIntervalMs);
    }
}
exports.AgentFlowWSServer = AgentFlowWSServer;
//# sourceMappingURL=server.js.map