import type { PluginStore } from '../store/index.js';
export declare function createSessionHook(store: PluginStore): {
    /** Fires when a new session is created */
    'session.created': (input: unknown) => Promise<void>;
    /** Fires when session becomes idle (all work done) */
    'session.idle': () => Promise<void>;
    /** Fires on session error */
    'session.error': (input: unknown) => Promise<void>;
};
/** Get current session ID (for other hooks to use) */
export declare function getCurrentSessionId(): string | null;
