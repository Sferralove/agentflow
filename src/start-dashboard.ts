#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PluginStore } from './store/index.js';
import { DashboardServer } from './server.js';
import { buildCollector } from './collector.js';
import type { AgentEvent } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = parseInt(process.env.PORT || '3001', 10);
const cwd = process.cwd();

// Ensure data directory exists
const dataDir = path.join(cwd, '.agent-flow', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// Single store instance — all reads and writes go through this
const store = new PluginStore(cwd);
const dashboardServer = new DashboardServer(store, { port, host: 'localhost' });

// Serve static dashboard
const dashboardPath = path.join(__dirname, 'dashboard');
dashboardServer.serveStatic(dashboardPath);

// Start HTTP + WebSocket server
dashboardServer.start();

// --- SSE Collector (always tries, auto-detects auth) ---

const opencodeUrl = process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4101/global/event';
const opencodePassword = process.env.OPENCODE_SERVER_PASSWORD;
const opencodeUsername = process.env.OPENCODE_SERVER_USERNAME;

const collector = buildCollector(store, (event: AgentEvent) => {
  dashboardServer.broadcast(event);
});

collector.connect(opencodeUrl, opencodeUsername, opencodePassword);

if (opencodePassword) {
  console.log(`[agent-flow] SSE collector: ${opencodeUrl} (auth: basic)`);
} else {
  console.log(`[agent-flow] SSE collector: ${opencodeUrl} (trying without auth)`);
  console.log('[agent-flow] If OpenCode requires auth, set OPENCODE_SERVER_PASSWORD.');
  console.log('[agent-flow] Events also accepted via POST /api/agent/event');
}

// Graceful shutdown
const shutdown = () => {
  collector.disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
