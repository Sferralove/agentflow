import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import type { AgentEvent, DashboardConfig } from './types.js';
import type { PluginStore } from './store/index.js';

/** Only allow access from localhost — prevents data exfiltration by 3rd-party browser tabs */
function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

/** Express middleware that rejects non-localhost requests using unspoofable remoteAddress */
function localhostOnly(req: Request, res: Response, next: NextFunction): void {
  const remote = req.socket.remoteAddress || '';
  if (remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1') {
    return next();
  }
  res.status(403).json({ error: 'access denied — localhost only' });
}

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

    // Security: reject non-localhost requests on all routes
    this.app.use(localhostOnly);
    this.app.use(express.json());

    // API: list sessions
    this.app.get('/api/sessions', (_req, res) => {
      res.json({ sessions: this.store.getSessions() });
    });

    // API: get events for a session (last 500 by default)
    this.app.get('/api/events/:sessionId', (req, res) => {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
      res.json({ events: this.store.getEvents(req.params.sessionId, limit) });
    });

    // API: accept events from agents (POST) — secondary channel
    this.app.post('/api/agent/event', async (req, res) => {
      try {
        const event = req.body;
        if (!event || !event.type || !event.agent) {
          res.status(400).json({ error: 'Missing required fields: type, agent' });
          return;
        }
        const agentEvent: AgentEvent = {
          id: event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          sessionId: event.sessionId || 'default',
          type: event.type,
          agent: event.agent,
          targetAgent: event.targetAgent,
          payload: event.payload || {},
          timestamp: event.timestamp || Date.now(),
        };
        await this.store.addEvent(agentEvent);
        this.broadcast(agentEvent);
        res.json({ ok: true });
      } catch (err) {
        console.error('[agent-flow] Error processing event POST:', err);
        res.status(500).json({ error: 'Internal error' });
      }
    });
  }

  /** Serve static dashboard build from given path */
  serveStatic(dashboardPath: string): void {
    if (!fs.existsSync(dashboardPath)) return;
    this.app.use(express.static(dashboardPath));
    // SPA fallback (also behind localhostOnly middleware)
    this.app.use((_req, res) => {
      const indexPath = path.join(dashboardPath, 'index.html');
      if (fs.existsSync(indexPath)) res.sendFile(indexPath);
      else res.status(404).send('Dashboard not built. Run: cd dashboard && npm run build');
    });
  }

  /** Start the server */
  start(): void {
    this.server = http.createServer(this.app);

    this.wss = new WebSocketServer({
      server: this.server,
      verifyClient: (info: { origin: string; req: http.IncomingMessage }) => {
        if (isLocalhostOrigin(info.origin)) return true;
        if (!info.origin) {
          const host = info.req.headers.host || '';
          return host.startsWith('localhost:') || host.startsWith('127.0.0.1:') || host.startsWith('[::1]:');
        }
        return false;
      },
    });

    // Suppress WS errors — they propagate from the HTTP server which already handles them
    this.wss.on('error', () => {
      // EADDRINUSE and other listen errors handled by HTTP server listener below
    });

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

    this.server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`[agent-flow] Port ${this.config.port} already in use.`);
        console.error(`[agent-flow] Kill the other process or use: PORT=${this.config.port + 1} npx @sferralove/agent-flow-plugin`);
      } else {
        console.error('[agent-flow] Server error:', err.message);
      }
    });

    this.server.listen(this.config.port, this.config.host, () => {
      console.log(`[agent-flow] Dashboard: http://${this.config.host}:${this.config.port}`);
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

  /** Stop the server gracefully */
  stop(): void {
    this.wss?.close();
    this.server?.close();
    this.store.close();
  }
}
