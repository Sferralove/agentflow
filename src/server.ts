import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import type { AgentEvent, DashboardConfig } from './types.js';
import type { PluginStore } from './store/index.js';

export class DashboardServer {
  private app: express.Application;
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private subscriptions = new Map<WebSocket, string>();
  private store: PluginStore;
  private config: DashboardConfig;

  constructor(store: PluginStore, config: DashboardConfig) {
    this.store = store;
    this.config = config;

    this.app = express();

    // API: list sessions
    this.app.get('/api/sessions', (_req, res) => {
      res.json({ sessions: this.store.getSessions() });
    });

    // API: get events for a session
    this.app.get('/api/events/:sessionId', (req, res) => {
      res.json({ events: this.store.getEvents(req.params.sessionId) });
    });
  }

  /** Serve static dashboard build from given path */
  serveStatic(dashboardPath: string): void {
    if (!fs.existsSync(dashboardPath)) return;
    this.app.use(express.static(dashboardPath));
    // SPA fallback
    this.app.get('*', (_req, res) => {
      const indexPath = path.join(dashboardPath, 'index.html');
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.status(404).send('Dashboard not built. Run: cd dashboard && npm run build');
    });
  }

  /** Start the server */
  start(): void {
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws: WebSocket) => {
      // Send initial session list
      ws.send(JSON.stringify({ type: 'sessionList', sessions: this.store.getSessions() }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'subscribe' && typeof msg.sessionId === 'string') {
            this.subscriptions.set(ws, msg.sessionId);
          } else if (msg.type === 'requestSessions') {
            ws.send(JSON.stringify({ type: 'sessionList', sessions: this.store.getSessions() }));
          }
        } catch {
          // Ignore malformed messages
        }
      });

      ws.on('close', () => {
        this.subscriptions.delete(ws);
      });
    });

    this.server.listen(this.config.port, this.config.host, () => {
      console.log(`[agent-flow] Dashboard: http://${this.config.host}:${this.config.port}`);
    });

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[agent-flow] Port ${this.config.port} in use. Dashboard unavailable.`);
      } else {
        console.error('[agent-flow] Server error:', err.message);
      }
    });
  }

  /** Broadcast event to clients subscribed to matching sessionId */
  broadcast(event: AgentEvent): void {
    if (!this.wss) return;
    const data = JSON.stringify({ type: 'event', event });
    for (const [ws, sessionId] of this.subscriptions) {
      if (ws.readyState === WebSocket.OPEN && sessionId === event.sessionId) {
        ws.send(data);
      }
    }
  }
}
