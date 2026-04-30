import type { AgentEvent, AgentInfo, AgentNode, EventFilter, EventStore, SessionData } from '../types';
export declare class MultiStore implements EventStore {
    private dataDir;
    private stores;
    constructor(dataDir: string);
    private getStore;
    addEvent(event: AgentEvent): Promise<void>;
    getEvents(filter?: EventFilter): Promise<AgentEvent[]>;
    getSession(sessionId: string): Promise<SessionData | null>;
    getAgentInfo(agentId: string): Promise<AgentInfo | null>;
    getAgentTree(sessionId: string): Promise<AgentNode[]>;
    getAllSessions(): Promise<string[]>;
}
//# sourceMappingURL=multi-store.d.ts.map