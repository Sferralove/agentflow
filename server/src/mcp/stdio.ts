#!/usr/bin/env node
import path from 'path';
import { MultiStore } from '../store/multi-store';
import { AgentFlowMCPServer } from './server';

const dataDir = path.join(process.cwd(), '.agent-flow', 'data');
const store = new MultiStore(dataDir);
const server = new AgentFlowMCPServer(store);

server.start().catch(console.error);
