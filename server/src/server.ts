import type { Server } from 'http';
import fs from 'fs';
import path from 'path';
import { MultiStore } from './store/multi-store';
import { AgentFlowMCPServer } from './mcp/server';
import { AgentFlowWSServer } from './ws/server';
import type { AgentEvent } from './types';

export class AgentFlowServer {
  private store: MultiStore;
  private mcpServer: AgentFlowMCPServer;
  private wsServer: AgentFlowWSServer;
  private dataDir: string;
  private watcher: fs.FSWatcher | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(dataDir: string, wsPort: number) {
    this.dataDir = dataDir;
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

  /** Watch data directory for external file changes (new sessions, direct disk writes) */
  startFileWatcher(): void {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.watcher = fs.watch(this.dataDir, { persistent: false }, (_event, filename) => {
      // Only react to .json files (not .tmp)
      if (!filename || !filename.endsWith('.json') || filename.endsWith('.tmp')) return;

      // Debounce: multiple filesystem events in quick succession
      if (this.reloadTimer) clearTimeout(this.reloadTimer);
      this.reloadTimer = setTimeout(() => {
        const sessionId = filename.replace('.json', '');
        // Reload the file into memory
        this.store.reloadSession(sessionId);
        // Tell all clients to refresh
        this.wsServer.broadcast({ type: 'reload' });
      }, 200);
    });
  }

  async startMCP(): Promise<void> {
    await this.mcpServer.start();
  }

  async startWS(httpServer?: Server): Promise<void> {
    await this.wsServer.start(httpServer);
  }

  async stop(): Promise<void> {
    if (this.reloadTimer) clearTimeout(this.reloadTimer);
    if (this.watcher) this.watcher.close();
    try { await this.wsServer.stop(); } catch { /* ignore */ }
    try { await this.mcpServer.stop(); } catch { /* ignore */ }
  }

  getStore(): MultiStore {
    return this.store;
  }
}
