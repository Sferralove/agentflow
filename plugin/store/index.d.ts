import type { AgentEvent } from '../types.js';
export declare class PluginStore {
    private baseDir;
    constructor(directory: string);
    /** Write a single event to the session file */
    addEvent(event: AgentEvent): Promise<void>;
    /** Read all events for a session */
    getEvents(sessionId: string): AgentEvent[];
    /** List all session IDs */
    getSessions(): string[];
}
