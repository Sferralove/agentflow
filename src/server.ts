import { JsonStore } from './store/json-store';
import { AgentFlowMCPServer } from './mcp/server';
import { AgentFlowWSServer } from './ws/server';
import type { AgentEvent } from './types';

export class AgentFlowServer {
  private store: JsonStore;
  private mcpServer: AgentFlowMCPServer;
  private wsServer: AgentFlowWSServer;

  constructor(dataDir: string, wsPort: number) {
    const storePath = `${dataDir}/events.json`;
    this.store = new JsonStore(storePath);
    this.wsServer = new AgentFlowWSServer(wsPort);

    // Connect store events to WS broadcast via callback
    this.wsServer.setEventCallback((event: AgentEvent) => {
      this.wsServer.broadcast(event);
    });

    // Wrap store.addEvent to trigger WS callback
    const originalAddEvent = this.store.addEvent.bind(this.store);
    this.store.addEvent = async (event: AgentEvent) => {
      await originalAddEvent(event);
      this.wsServer.broadcast(event);
    };

    this.mcpServer = new AgentFlowMCPServer(this.store);
  }

  async startMCP(): Promise<void> {
    await this.mcpServer.start();
  }

  async startWS(): Promise<void> {
    await this.wsServer.start();
  }

  async stop(): Promise<void> {
    await this.wsServer.stop();
  }

  getStore(): JsonStore {
    return this.store;
  }
}
