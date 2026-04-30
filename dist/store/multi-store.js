"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const json_store_1 = require("./json-store");
class MultiStore {
    dataDir;
    stores = new Map();
    constructor(dataDir) {
        this.dataDir = dataDir;
        if (!fs_1.default.existsSync(dataDir)) {
            fs_1.default.mkdirSync(dataDir, { recursive: true });
        }
    }
    getStore(sessionId) {
        if (!this.stores.has(sessionId)) {
            const filePath = path_1.default.join(this.dataDir, `${sessionId}.json`);
            this.stores.set(sessionId, new json_store_1.JsonStore(filePath));
        }
        return this.stores.get(sessionId);
    }
    async addEvent(event) {
        await this.getStore(event.sessionId).addEvent(event);
    }
    async getEvents(filter) {
        // If session filter, query only that session
        if (filter?.sessionId) {
            return this.getStore(filter.sessionId).getEvents(filter);
        }
        // Otherwise merge all sessions
        const all = [];
        for (const sessionId of await this.getAllSessions()) {
            const events = await this.getStore(sessionId).getEvents(filter);
            all.push(...events);
        }
        return all.sort((a, b) => a.timestamp - b.timestamp);
    }
    async getSession(sessionId) {
        return this.getStore(sessionId).getSession(sessionId);
    }
    async getAgentInfo(agentId) {
        for (const sessionId of await this.getAllSessions()) {
            const info = await this.getStore(sessionId).getAgentInfo(agentId);
            if (info)
                return info;
        }
        return null;
    }
    async getAgentTree(sessionId) {
        return this.getStore(sessionId).getAgentTree(sessionId);
    }
    async getAllSessions() {
        if (!fs_1.default.existsSync(this.dataDir))
            return [];
        const files = fs_1.default.readdirSync(this.dataDir);
        return files
            .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
            .map(f => f.replace('.json', ''));
    }
}
exports.MultiStore = MultiStore;
//# sourceMappingURL=multi-store.js.map