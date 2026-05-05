import fs from 'fs';
import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createEventHooks } from './hooks/event.js';
import { createToolHooks } from './hooks/tool.js';
import { createTools } from './tools/index.js';

interface PluginInput {
  directory: string;
}

export const server = async ({ directory }: PluginInput) => {
  const marker = `/tmp/agent-flow-loaded-${Date.now()}`;
  try { fs.writeFileSync(marker, directory); } catch {}

  const store = new PluginStore(directory);
  const container = new PluginContainer();
  const eventHooks = createEventHooks(store, container);
  const toolHooks = createToolHooks(store, container);
  const tools = createTools(store);

  try { console.warn('[agent-flow] Plugin loaded'); } catch {}

  return { ...eventHooks, ...toolHooks, tool: tools };
};
