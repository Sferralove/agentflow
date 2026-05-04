"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statusCommand = statusCommand;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const json_store_1 = require("../store/json-store");
function statusCommand(program) {
    program
        .command('status')
        .description('Show server status and active sessions')
        .action(async () => {
        const dataDir = path_1.default.join(process.cwd(), '.agent-flow', 'data');
        const eventsFile = path_1.default.join(dataDir, 'events.json');
        if (!fs_1.default.existsSync(eventsFile)) {
            console.log('No data found. Run "agent-flow init" and "agent-flow serve" first.');
            return;
        }
        const store = new json_store_1.JsonStore(eventsFile);
        const sessions = await store.getAllSessions();
        console.log(`Active sessions: ${sessions.length}`);
        for (const sessionId of sessions) {
            const session = await store.getSession(sessionId);
            if (session) {
                console.log(`  - ${sessionId}: ${session.events.length} events, ${session.agents.size} agents`);
            }
        }
    });
}
//# sourceMappingURL=status.js.map