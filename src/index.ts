/**
 * Agent Flow Plugin — automatic OpenCode monitoring
 * 
 * Hooks into OpenCode events to capture ALL agent activity without
 * requiring explicit cooperation from agents. Writes to .agent-flow/data/
 * for the existing dashboard to visualize.
 * 
 * Usage:
 *   1. Add "agent-flow-plugin" to opencode.json plugin array
 *   2. Run "npx agent-flow serve" for the dashboard
 *   3. Everything auto-logged — agents don't need to know
 */

import { PluginStore } from './store/index.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';

export const AgentFlowPlugin = async ({ directory }: { directory: string }) => {
  const store = new PluginStore(directory);

  const sessionHooks = createSessionHook(store);
  const toolHooks = createToolHooks(store);
  const messageHooks = createMessageHooks(store);
  const tools = createTools(store);

  // Log plugin startup
  console.log('[agent-flow] Plugin loaded — monitoring all activity');
  console.log(`[agent-flow] Data directory: ${directory}/.agent-flow/data/`);

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
