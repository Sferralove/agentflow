/**
 * Agent Flow Plugin — automatic OpenCode monitoring
 *
 * Hooks into OpenCode events to capture ALL agent activity without
 * requiring explicit cooperation from agents. Writes to .agent-flow/data/.
 *
 * Usage:
 *   1. Add "agent-flow-plugin" to opencode.json plugin array
 *   2. Everything auto-logged — agents don't need to know
 */

import type { Logger } from './types.js';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';

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

  const sessionHooks = createSessionHook(store, container);
  const toolHooks = createToolHooks(store, container);
  const messageHooks = createMessageHooks(store, container);
  const tools = createTools(store);

  log.info('[agent-flow] Plugin loaded — monitoring all activity');
  log.info(`[agent-flow] Data directory: ${directory}/.agent-flow/data/`);

  return {
    // Session lifecycle
    ...sessionHooks,

    // Tool execution tracking
    ...toolHooks,

    // Message tracking
    ...messageHooks,

    // Custom tools agents can call
    tool: tools,
  };
};
