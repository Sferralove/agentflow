import { WebSocketServer, WebSocket } from 'ws';
import type { EventStore, AgentEvent, WSMessage } from '../types';

export class AgentFlowWSServer {
  private wss: WebSocketServer | null = null;
  private port: number;
  private heartbeatIntervalMs: number;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private onEventCallback?: (event: AgentEvent) => void;

  constructor(port: number, heartbeatIntervalMs = 30000) {
    this.port = port;
    this.heartbeatIntervalMs = heartbeatIntervalMs;
  }

  setEventCallback(callback: (event: AgentEvent) => void): void {
    this.onEventCallback = callback;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss = new WebSocketServer({ port: this.port });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      this.wss.on('error', (err) => {
        console.error('WebSocket server error:', err);
        reject(err);
      });

      this.wss.on('listening', () => {
        console.log(`WebSocket server started on port ${this.port}`);
        resolve();
        this.startHeartbeat();
      });
    });
  }

  async stop(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => resolve());
      });
      this.wss = null;
    }
  }

  private handleConnection(ws: WebSocket): void {
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

  private handleMessage(ws: WebSocket, data: string): void {
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'ack') {
        // Acknowledgment received
      }
    } catch {
      // Invalid message, ignore
    }
  }

  broadcast(event: AgentEvent): void {
    if (!this.wss) return;

    const message: WSMessage = {
      type: 'event',
      data: event,
    };

    const payload = JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;

      const message: WSMessage = { type: 'heartbeat' };
      const payload = JSON.stringify(message);

      this.wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(payload);
        }
      });
    }, this.heartbeatIntervalMs);
  }
}
