import { PluginStore } from './store/index.js';
import { createTools } from './tools/index.js';

interface PluginInput {
  directory: string;
}

export const server = async ({ directory }: PluginInput) => {
  const store = new PluginStore(directory);
  const tools = createTools(store);
  return { tool: tools };
};
