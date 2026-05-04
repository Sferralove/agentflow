#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const multi_store_1 = require("../store/multi-store");
const server_1 = require("./server");
const dataDir = path_1.default.join(process.cwd(), '.agent-flow', 'data');
const store = new multi_store_1.MultiStore(dataDir);
const server = new server_1.AgentFlowMCPServer(store);
server.start().catch(console.error);
//# sourceMappingURL=stdio.js.map