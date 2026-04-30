#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const init_1 = require("./init");
const serve_1 = require("./serve");
const dev_1 = require("./dev");
const status_1 = require("./status");
const export_1 = require("./export");
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
program.parse();
//# sourceMappingURL=index.js.map