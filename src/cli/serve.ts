import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { AgentFlowServer } from '../server';
import { createAPIRouter } from '../api/routes';

export function serveCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the agent-flow server')
    .option('-p, --port <number>', 'WebSocket port', '3001')
    .action(async (options) => {
      const wsPort = parseInt(options.port, 10);
      if (isNaN(wsPort)) {
        console.error('Error: Invalid port number');
        process.exit(1);
      }
      const dataDir = path.join(process.cwd(), '.agent-flow', 'data');

      if (!fs.existsSync(dataDir)) {
        console.error('Error: Run "agent-flow init" first');
        process.exit(1);
      }

      const server = new AgentFlowServer(dataDir, wsPort);
      const store = server.getStore();

      const app = express();
      app.use(createAPIRouter(store));

      const frontendDist = path.join(__dirname, '../../frontend/dist');
      if (fs.existsSync(frontendDist)) {
        app.use(express.static(frontendDist));
      }

      app.listen(3000, () => {
        console.log('Dashboard: http://localhost:3000');
      });

      // Register shutdown handlers before anything blocking
      const shutdown = async () => {
        console.log('\nShutting down...');
        await server.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      await server.startWS();
      console.log(`WebSocket: ws://localhost:${wsPort}`);
      console.log('API: http://localhost:3000/api');

      // Start MCP in background (stdio transport blocks)
      server.startMCP().catch(console.error);
      console.log('MCP server available via stdio');
    });
}
