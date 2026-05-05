#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PluginStore } from './store/index.js';
import { DashboardServer } from './server.js';
import { buildCollector } from './collector.js';
import type { AgentFlowEvent } from './collector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = parseInt(process.env.PORT || '3001', 10);
const cwd = process.cwd();
const dataDir = path.join(cwd, '.agent-flow', 'data');

// Ensure data directory exists
fs.mkdirSync(dataDir, { recursive: true });

const store = new PluginStore(cwd);
const dashboardServer = new DashboardServer(store, { port, host: 'localhost' });

const dashboardPath = path.join(__dirname, 'dashboard');
dashboardServer.serveStatic(dashboardPath);

// Track seen event IDs to avoid duplicate broadcasts
const seenIds = new Set<string>();
function loadAndBroadcast(sessionId: string) {
  const events = store.getEvents(sessionId);
  for (const event of events) {
    if (!seenIds.has(event.id)) {
      seenIds.add(event.id);
      dashboardServer.broadcast(event);
    }
  }
}

// Load existing events on startup
for (const sessionId of store.getSessions()) {
  loadAndBroadcast(sessionId);
}

// Watch for new event files
let watchTimeout: ReturnType<typeof setTimeout> | null = null;
fs.watch(dataDir, (eventType, filename) => {
  if (!filename?.endsWith('.json') || filename.endsWith('.tmp')) return;
  const sessionId = filename.replace('.json', '');
  if (watchTimeout) clearTimeout(watchTimeout);
  watchTimeout = setTimeout(() => loadAndBroadcast(sessionId), 100);
});

// SSE Collector — connect to OpenCode server if password is set
const opencodePassword = process.env.OPENCODE_SERVER_PASSWORD;
const opencodeUsername = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
const opencodeUrl = process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4101/global/event';

if (opencodePassword) {
  const collector = buildCollector(dataDir, (event: AgentFlowEvent) => {
    dashboardServer.broadcast({
      id: event.id,
      sessionId: event.sessionId,
      type: event.type as 'start' | 'complete' | 'dispatch' | 'task' | 'error' | 'message',
      agent: event.label,
      payload: event.payload,
      timestamp: new Date(event.ts).getTime(),
    });
  });

  collector.connect(opencodeUrl, opencodeUsername, opencodePassword);
  console.log(`[agent-flow] SSE collector: ${opencodeUrl}`);

  // Graceful shutdown
  process.on('SIGINT', () => {
    collector.disconnect();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    collector.disconnect();
    process.exit(0);
  });
}

dashboardServer.start();
