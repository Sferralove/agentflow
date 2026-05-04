import type { PluginStore } from '../store/index.js';
export declare function createMessageHooks(store: PluginStore): {
    /** Fires when a message is updated (agent response received) */
    'message.updated': (input: unknown) => Promise<void>;
};
