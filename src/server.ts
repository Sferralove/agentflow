import type { Server } from 'http';
import { MultiStore } from './store/multi-store';
import { AgentFlowMCPServer } from './mcp/server';
import { AgentFlowWSServer } from './ws/server';
import type { AgentEvent } from './types';

export class AgentFlowServer {
  private store: MultiStore;
  private mcpServer: AgentFlowMCPServer;
  private wsServer: AgentFlowWSServer;

  constructor(dataDir: string, wsPort: number) {
    this.store = new MultiStore(dataDir);
    this.wsServer = new AgentFlowWSServer(wsPort);

    // Wrap store.addEvent to trigger WS broadcast via monkey-patch
    // Broadcast FIRST (real-time), then persist asynchronously
    const originalAddEvent = this.store.addEvent.bind(this.store);
    this.store.addEvent = async (event: AgentEvent) => {
      // Push to memory and persist (non-blocking for broadcast)
      const savePromise = originalAddEvent(event);
      // Broadcast immediately — don't wait for disk I/O
      this.wsServer.broadcast(event);
      await savePromise;
    };

    this.mcpServer = new AgentFlowMCPServer(this.store);
  }

  async startMCP(): Promise<void> {
    await this.mcpServer.start();
  }

  async startWS(httpServer?: Server): Promise<void> {
    await this.wsServer.start(httpServer);
  }

  async stop(): Promise<void> {
    await this.wsServer.stop();
    await this.mcpServer.stop();
  }

  getStore(): MultiStore {
    return this.store;
  }
}
