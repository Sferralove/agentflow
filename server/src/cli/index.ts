#!/usr/bin/env node
import { Command } from 'commander';
import { initCommand } from './init';
import { serveCommand } from './serve';
import { devCommand } from './dev';
import { statusCommand } from './status';
import { exportCommand } from './export';

const program = new Command();

program
  .name('agent-flow')
  .description('Agent/Subagent flow monitoring for OpenCode')
  .version('0.1.0');

initCommand(program);
serveCommand(program);
devCommand(program);
statusCommand(program);
exportCommand(program);

program.parse();
