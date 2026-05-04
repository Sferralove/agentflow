"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
class JsonStore {
    filePath;
    events = [];
    agents = new Map();
    lastMtime = 0;
    constructor(filePath) {
        this.filePath = filePath;
        this.load();
    }
    load() {
        if (fs_1.default.existsSync(this.filePath)) {
            try {
                const stat = fs_1.default.statSync(this.filePath);
                this.lastMtime = stat.mtimeMs;
                const data = fs_1.default.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(data);
                this.events = parsed.events || [];
                this.agents = new Map(Object.entries(parsed.agents || {}).map(([k, v]) => [k, v]));
            }
            catch {
                this.events = [];
                this.agents = new Map();
                this.lastMtime = 0;
            }
        }
    }
    /** Reload from disk if file was modified since last load */
    reloadIfChanged() {
        if (!fs_1.default.existsSync(this.filePath))
            return;
        try {
            const stat = fs_1.default.statSync(this.filePath);
            if (stat.mtimeMs > this.lastMtime) {
                this.load();
            }
        }
        catch {
            // stat failed, skip reload
        }
    }
    async save() {
        const dir = path_1.default.dirname(this.filePath);
        if (!fs_1.default.existsSync(dir)) {
            fs_1.default.mkdirSync(dir, { recursive: true });
        }
        const data = {
            events: this.events,
            agents: Object.fromEntries(this.agents),
        };
        const tmpPath = this.filePath + '.tmp';
        await fs_1.default.promises.writeFile(tmpPath, JSON.stringify(data, null, 2));
        await fs_1.default.promises.rename(tmpPath, this.filePath);
        // Update mtime after our own write to avoid unnecessary reload
        try {
            this.lastMtime = fs_1.default.statSync(this.filePath).mtimeMs;
        }
        catch { /* ignore */ }
    }
    async addEvent(event) {
        this.events.push(event);
        this.updateAgentFromEvent(event);
        await this.save();
    }
    updateAgentFromEvent(event) {
        let agent = this.agents.get(event.agent);
        if (!agent) {
            agent = {
                id: event.agent,
                name: event.agent,
                type: 'main',
                children: [],
                capabilities: [],
                status: 'idle',
                sessionId: event.sessionId,
                startedAt: event.timestamp,
                tasksCompleted: 0,
                tasksFailed: 0,
            };
            this.agents.set(event.agent, agent);
        }
        switch (event.type) {
            case 'start':
                agent.status = 'running';
                agent.startedAt = event.timestamp;
                break;
            case 'complete':
                agent.status = 'completed';
                agent.completedAt = event.timestamp;
                agent.tasksCompleted++;
                break;
            case 'dispatch':
                if (event.targetAgent) {
                    if (!agent.children.includes(event.targetAgent)) {
                        agent.children.push(event.targetAgent);
                    }
                    let child = this.agents.get(event.targetAgent);
                    if (!child) {
                        child = {
                            id: event.targetAgent,
                            name: event.targetAgent,
                            type: 'subagent',
                            children: [],
                            capabilities: [],
                            status: 'idle',
                            sessionId: event.sessionId,
                            parentId: event.agent,
                            startedAt: event.timestamp,
                            tasksCompleted: 0,
                            tasksFailed: 0,
                        };
                        this.agents.set(event.targetAgent, child);
                    }
                    else {
                        child.parentId = event.agent;
                        child.type = 'subagent';
                    }
                }
                break;
            case 'error':
                agent.status = 'error';
                agent.tasksFailed++;
                break;
            case 'task':
            case 'message':
                // No state change for task/message events
                break;
            default:
                // Unknown event type, ignore
                break;
        }
    }
    async getEvents(filter) {
        this.reloadIfChanged();
        let result = this.events;
        if (filter) {
            if (filter.agent) {
                result = result.filter(e => e.agent === filter.agent);
            }
            if (filter.type) {
                result = result.filter(e => e.type === filter.type);
            }
            if (filter.sessionId) {
                result = result.filter(e => e.sessionId === filter.sessionId);
            }
            if (filter.from !== undefined) {
                result = result.filter(e => e.timestamp >= filter.from);
            }
            if (filter.to !== undefined) {
                result = result.filter(e => e.timestamp <= filter.to);
            }
        }
        return [...result];
    }
    async getSession(sessionId) {
        this.reloadIfChanged();
        const events = this.events.filter(e => e.sessionId === sessionId);
        if (events.length === 0)
            return null;
        const agents = new Map();
        for (const event of events) {
            const agent = this.agents.get(event.agent);
            if (agent && !agents.has(event.agent)) {
                agents.set(event.agent, { ...agent });
            }
            // Include child agents created via dispatch
            if (event.targetAgent) {
                const child = this.agents.get(event.targetAgent);
                if (child && !agents.has(event.targetAgent)) {
                    agents.set(event.targetAgent, { ...child });
                }
            }
        }
        return {
            id: sessionId,
            agents,
            events,
            startedAt: events[0]?.timestamp || Date.now(),
        };
    }
    async getAgentInfo(agentId) {
        this.reloadIfChanged();
        return this.agents.get(agentId) || null;
    }
    async getAgentTree(sessionId) {
        const session = await this.getSession(sessionId);
        if (!session)
            return [];
        return Array.from(session.agents.values()).map(agent => ({
            ...agent,
            events: session.events.filter(e => e.agent === agent.id),
        }));
    }
    async getAllSessions() {
        this.reloadIfChanged();
        const sessions = new Set();
        for (const event of this.events) {
            sessions.add(event.sessionId);
        }
        return Array.from(sessions);
    }
}
exports.JsonStore = JsonStore;
//# sourceMappingURL=json-store.js.map