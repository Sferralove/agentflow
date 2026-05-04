/**
 * Agent Flow Plugin — automatic OpenCode monitoring
 *
 * Hooks into OpenCode events to capture ALL agent activity without
 * requiring explicit cooperation from agents. Writes to .agent-flow/data/.
 * Starts dashboard server at configured port.
 *
 * Usage:
 *   1. Add "agent-flow-plugin" to opencode.json plugin array
 *   2. Everything auto-logged — agents don't need to know
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { DashboardConfig } from './types.js';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';
import { DashboardServer } from './server.js';

interface PluginInput {
  directory: string;
}

const DEFAULT_CONFIG: DashboardConfig = {
  port: 3001,
  host: 'localhost',
};

function loadConfig(directory: string): DashboardConfig {
  const configPath = path.join(directory, '.agent-flow', 'config.json');
  try {
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return { ...DEFAULT_CONFIG, ...(raw.dashboard || {}) };
    }
  } catch { /* config parse error, use defaults */ }
  return DEFAULT_CONFIG;
}

export const server = async ({ directory }: PluginInput) => {
  const store = new PluginStore(directory);
  const container = new PluginContainer();
  const config = loadConfig(directory);

  // Dashboard server
  const dashboardServer = new DashboardServer(store, config);
  const broadcast = (event: import('./types.js').AgentEvent) => dashboardServer.broadcast(event);

  // Dashboard static files path (relative to plugin install dir, not cwd)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dashboardPath = path.join(__dirname, 'dashboard');
  dashboardServer.serveStatic(dashboardPath);

  const sessionHooks = createSessionHook(store, container, broadcast);
  const toolHooks = createToolHooks(store, container, broadcast);
  const messageHooks = createMessageHooks(store, container, broadcast);
  const tools = createTools(store);

  // Start server (non-blocking, failures handled internally)
  try {
    dashboardServer.start();
  } catch (err) {
    console.error('[agent-flow] Failed to start dashboard server:', err);
  }

  console.log('[agent-flow] Plugin loaded — monitoring all activity');
  console.log(`[agent-flow] Data directory: ${directory}/.agent-flow/data/`);

  return {
    ...sessionHooks,
    ...toolHooks,
    ...messageHooks,
    tool: tools,
  };
};
