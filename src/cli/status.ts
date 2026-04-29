import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { JsonStore } from '../store/json-store';

export function statusCommand(program: Command): void {
  program
    .command('status')
    .description('Show server status and active sessions')
    .action(async () => {
      const dataDir = path.join(process.cwd(), '.agent-flow', 'data');
      const eventsFile = path.join(dataDir, 'events.json');

      if (!fs.existsSync(eventsFile)) {
        console.log('No data found. Run "agent-flow init" and "agent-flow serve" first.');
        return;
      }

      const store = new JsonStore(eventsFile);
      const sessions = await store.getAllSessions();

      console.log(`Active sessions: ${sessions.length}`);
      for (const sessionId of sessions) {
        const session = await store.getSession(sessionId);
        if (session) {
          console.log(`  - ${sessionId}: ${session.events.length} events, ${session.agents.size} agents`);
        }
      }
    });
}
