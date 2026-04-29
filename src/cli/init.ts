import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize agent-flow in the current project')
    .action(async () => {
      const configDir = path.join(process.cwd(), '.agent-flow');
      const configFile = path.join(configDir, 'config.json');

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const config = {
        version: '0.1.0',
        dataDir: '.agent-flow/data',
        wsPort: 3001,
        createdAt: new Date().toISOString(),
      };

      fs.writeFileSync(configFile, JSON.stringify(config, null, 2));

      // Create data directory
      const dataDir = path.join(process.cwd(), config.dataDir);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      console.log('Agent Flow initialized!');
      console.log(`Config: ${configFile}`);
      console.log(`Data: ${dataDir}`);
      console.log('');
      console.log('Next steps:');
      console.log('  1. Add MCP server to your OpenCode config');
      console.log('  2. Run: npx agent-flow serve');
    });
}
