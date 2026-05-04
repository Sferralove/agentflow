#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const readline_1 = __importDefault(require("readline"));
const init_1 = require("./init");
const serve_1 = require("./serve");
const dev_1 = require("./dev");
const status_1 = require("./status");
const export_1 = require("./export");
const plugin_1 = require("./plugin");
const program = new commander_1.Command();
program
    .name('agent-flow')
    .description('Agent/Subagent flow monitoring for OpenCode')
    .version('0.1.0');
(0, init_1.initCommand)(program);
(0, serve_1.serveCommand)(program);
(0, dev_1.devCommand)(program);
(0, status_1.statusCommand)(program);
(0, export_1.exportCommand)(program);
(0, plugin_1.pluginCommand)(program);
// Interactive mode when no subcommand given
if (process.argv.length <= 2) {
    const rl = readline_1.default.createInterface({ input: process.stdin, output: process.stdout });
    console.log('');
    console.log('  ⬡  Agent Flow v0.1.0');
    console.log('  ┌─────────────────────────────────────┐');
    console.log('  │                                     │');
    console.log('  │  1. Start server                    │');
    console.log('  │     → Dashboard + API on :3001      │');
    console.log('  │                                     │');
    console.log('  │  2. Dev mode                        │');
    console.log('  │     → Server + auto-restart         │');
    console.log('  │                                     │');
    console.log('  │  3. Deploy plugin                   │');
    console.log('  │     → Auto-monitoring, zero config  │');
    console.log('  │                                     │');
    console.log('  │  4. Init project                    │');
    console.log('  │     → First-time setup              │');
    console.log('  │                                     │');
    console.log('  │  5. Status                          │');
    console.log('  │     → View active sessions          │');
    console.log('  └─────────────────────────────────────┘');
    console.log('');
    rl.question('  Scegli [1-5]: ', (answer) => {
        rl.close();
        const cmds = {
            '1': ['serve'],
            '2': ['dev'],
            '3': ['plugin', 'deploy'],
            '4': ['init'],
            '5': ['status'],
        };
        const args = cmds[answer.trim()] || ['serve'];
        process.argv.push(...args);
        program.parse(process.argv);
    });
}
else {
    program.parse();
}
//# sourceMappingURL=index.js.map