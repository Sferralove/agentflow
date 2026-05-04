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
import type { Logger, DashboardConfig } from './types.js';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';
import { DashboardServer } from './server.js';

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

export const AgentFlowPlugin = async ({
  directory,
  logger,
}: {
  directory: string;
  logger?: Logger;
}) => {
  const store = new PluginStore(directory);
  const container = new PluginContainer();
  const log = logger ?? console;
  const config = loadConfig(directory);

  // Dashboard server
  const server = new DashboardServer(store, config);
  const broadcast = (event: import('./types.js').AgentEvent) => server.broadcast(event);

  // Dashboard static files path
  const dashboardPath = path.join(directory, 'dist', 'dashboard');
  server.serveStatic(dashboardPath);

  const sessionHooks = createSessionHook(store, container, broadcast);
  const toolHooks = createToolHooks(store, container, broadcast);
  const messageHooks = createMessageHooks(store, container, broadcast);
  const tools = createTools(store);

  // Start server (non-blocking, failures handled internally)
  try {
    server.start();
  } catch (err) {
    log.error('[agent-flow] Failed to start dashboard server:', err);
  }

  log.info('[agent-flow] Plugin loaded — monitoring all activity');
  log.info(`[agent-flow] Data directory: ${directory}/.agent-flow/data/`);

  return {
    ...sessionHooks,
    ...toolHooks,
    ...messageHooks,
    tool: tools,
  };
};
