import type { AgentEvent, AgentInfo, AgentNode, EventFilter, EventStore, SessionData } from '../types';
export declare class JsonStore implements EventStore {
    private filePath;
    private events;
    private agents;
    constructor(filePath: string);
    private load;
    private save;
    addEvent(event: AgentEvent): Promise<void>;
    private updateAgentFromEvent;
    getEvents(filter?: EventFilter): Promise<AgentEvent[]>;
    getSession(sessionId: string): Promise<SessionData | null>;
    getAgentInfo(agentId: string): Promise<AgentInfo | null>;
    getAgentTree(sessionId: string): Promise<AgentNode[]>;
    getAllSessions(): Promise<string[]>;
}
//# sourceMappingURL=json-store.d.ts.map