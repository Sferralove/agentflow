#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'readline';
import { initCommand } from './init';
import { serveCommand } from './serve';
import { devCommand } from './dev';
import { statusCommand } from './status';
import { exportCommand } from './export';
import { pluginCommand } from './plugin';

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
pluginCommand(program);

// Interactive mode when no subcommand given
if (process.argv.length <= 2) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

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

    const cmds: Record<string, string[]> = {
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
} else {
  program.parse();
}
