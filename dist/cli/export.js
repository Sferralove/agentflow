"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportCommand = exportCommand;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const json_store_1 = require("../store/json-store");
function exportCommand(program) {
    program
        .command('export')
        .description('Export events data')
        .option('-f, --format <format>', 'Output format (json|csv)', 'json')
        .option('-s, --session <id>', 'Filter by session ID')
        .action(async (options) => {
        const dataDir = path_1.default.join(process.cwd(), '.agent-flow', 'data');
        const eventsFile = path_1.default.join(dataDir, 'events.json');
        if (!fs_1.default.existsSync(eventsFile)) {
            console.error('No data found.');
            process.exit(1);
        }
        const store = new json_store_1.JsonStore(eventsFile);
        const events = await store.getEvents(options.session ? { sessionId: options.session } : undefined);
        if (options.format === 'csv') {
            const escapeCsv = (val) => {
                if (val === undefined || val === null)
                    return '';
                const s = String(val);
                if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    return `"${s.replace(/"/g, '""')}"`;
                }
                return s;
            };
            const headers = 'id,sessionId,type,agent,targetAgent,timestamp\n';
            const rows = events
                .map((e) => [e.id, e.sessionId, e.type, e.agent, e.targetAgent || '', e.timestamp]
                .map(escapeCsv)
                .join(','))
                .join('\n');
            console.log(headers + rows);
        }
        else {
            console.log(JSON.stringify(events, null, 2));
        }
    });
}
//# sourceMappingURL=export.js.map