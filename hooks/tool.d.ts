import type { PluginStore } from '../store/index.js';
export declare function createToolHooks(store: PluginStore): {
    /** Fires BEFORE a tool executes */
    'tool.execute.before': (input: unknown) => Promise<void>;
    /** Fires AFTER a tool executes */
    'tool.execute.after': (input: unknown, output: unknown) => Promise<void>;
};
