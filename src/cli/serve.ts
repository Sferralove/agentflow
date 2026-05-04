import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import http from 'http';
import express from 'express';
import { AgentFlowServer } from '../server';
import { createAPIRouter } from '../api/routes';

export function serveCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the agent-flow server')
    .option('-p, --port <number>', 'HTTP + WebSocket port', '3001')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      if (isNaN(port)) {
        console.error('Error: Invalid port number');
        process.exit(1);
      }
      const dataDir = path.join(process.cwd(), '.agent-flow', 'data');

      if (!fs.existsSync(dataDir)) {
        console.error('Error: Run "agent-flow init" first');
        process.exit(1);
      }

      const server = new AgentFlowServer(dataDir, port);
      const store = server.getStore();

      const app = express();
      app.use(createAPIRouter(store));

      const frontendDist = path.join(__dirname, '../public');
      if (fs.existsSync(frontendDist)) {
        app.use(express.static(frontendDist));
      } else {
        console.log('Warning: Frontend not found. Dashboard unavailable.');
      }

      const httpServer = http.createServer(app);

      // Register shutdown handlers before anything blocking
      const shutdown = async () => {
        console.log('\nShutting down...');
        httpServer.close();
        await server.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);

      await server.startWS(httpServer);

      httpServer.listen(port, () => {
        console.log(`Dashboard + API: http://localhost:${port}`);
        console.log(`WebSocket:     ws://localhost:${port}`);
      });
    });
}
