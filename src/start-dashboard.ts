#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { PluginStore } from './store/index.js';
import { DashboardServer } from './server.js';
import type { AgentEvent } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = parseInt(process.env.PORT || '3001', 10);
const cwd = process.cwd();
const dataDir = path.join(cwd, '.agent-flow', 'data');

if (!fs.existsSync(dataDir)) {
  console.error(`[agent-flow] No data directory: ${dataDir}`);
  console.error('[agent-flow] Run OpenCode in this project first to generate data.');
  process.exit(1);
}

const store = new PluginStore(cwd);
const dashboardServer = new DashboardServer(store, { port, host: 'localhost' });

const dashboardPath = path.join(__dirname, 'dashboard');
dashboardServer.serveStatic(dashboardPath);

// Track seen event IDs to avoid duplicate broadcasts on file change
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

dashboardServer.start();
