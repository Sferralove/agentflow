import type { Server } from 'http';
import type { AgentEvent, WSMessage } from '../types';
export declare class AgentFlowWSServer {
    private wss;
    private port;
    private heartbeatIntervalMs;
    private heartbeatInterval;
    private onEventCallback?;
    constructor(port: number, heartbeatIntervalMs?: number);
    setEventCallback(callback: (event: AgentEvent) => void): void;
    start(httpServer?: Server): Promise<void>;
    stop(): Promise<void>;
    private handleConnection;
    private handleMessage;
    broadcast(data: AgentEvent | WSMessage): void;
    private startHeartbeat;
}
//# sourceMappingURL=server.d.ts.map