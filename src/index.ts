import { PluginStore } from './store/index.js';
import { PluginContainer } from './plugin-container.js';
import { createToolHooks } from './hooks/tool.js';
import { createTools } from './tools/index.js';

interface PluginInput {
  directory: string;
}

export const server = async ({ directory }: PluginInput) => {
  const store = new PluginStore(directory);
  const container = new PluginContainer();

  const toolHooks = createToolHooks(store, container);
  const tools = createTools(store);

  return { ...toolHooks, tool: tools };
};
