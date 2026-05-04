import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createSessionHook } from './hooks/session.js';
import { createToolHooks } from './hooks/tool.js';
import { createMessageHooks } from './hooks/message.js';
import { createTools } from './tools/index.js';

interface PluginInput {
  directory: string;
}

export const server = async ({ directory }: PluginInput) => {
  const store = new PluginStore(directory);
  const container = new PluginContainer();

  const sessionHooks = createSessionHook(store, container);
  const toolHooks = createToolHooks(store, container);
  const messageHooks = createMessageHooks(store, container);
  const tools = createTools(store);

  console.log('[agent-flow] Plugin loaded — monitoring all activity');
  console.log(`[agent-flow] Data directory: ${directory}/.agent-flow/data/`);

  return {
    ...sessionHooks,
    ...toolHooks,
    ...messageHooks,
    tool: tools,
  };
};
