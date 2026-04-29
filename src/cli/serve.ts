import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import express from 'express';
import { AgentFlowServer } from '../server';

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

      // Start Express for frontend
      const app = express();
      const frontendDist = path.join(__dirname, '../../frontend/dist');

      if (fs.existsSync(frontendDist)) {
        app.use(express.static(frontendDist));
      }

      app.get('/api/sessions', async (_req: any, res: any) => {
        const sessions = await server.getStore().getAllSessions();
        res.json(sessions);
      });

      app.listen(3000, () => {
        console.log('Dashboard: http://localhost:3000');
      });

      await server.startWS();
      await server.startMCP();
      console.log(`WebSocket: ws://localhost:${wsPort}`);
      console.log('MCP server available via stdio');

      const shutdown = async () => {
        console.log('\nShutting down...');
        await server.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    });
}
