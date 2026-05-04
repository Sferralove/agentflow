import { Command } from 'commander';
import path from 'path';
import fs from 'fs';
import { JsonStore } from '../store/json-store';

export function exportCommand(program: Command): void {
  program
    .command('export')
    .description('Export events data')
    .option('-f, --format <format>', 'Output format (json|csv)', 'json')
    .option('-s, --session <id>', 'Filter by session ID')
    .action(async (options) => {
      const dataDir = path.join(process.cwd(), '.agent-flow', 'data');
      const eventsFile = path.join(dataDir, 'events.json');

      if (!fs.existsSync(eventsFile)) {
        console.error('No data found.');
        process.exit(1);
      }

      const store = new JsonStore(eventsFile);
      const events = await store.getEvents(
        options.session ? { sessionId: options.session } : undefined
      );

      if (options.format === 'csv') {
        const escapeCsv = (val: string | number | undefined) => {
          if (val === undefined || val === null) return '';
          const s = String(val);
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return `"${s.replace(/"/g, '""')}"`;
          }
          return s;
        };
        const headers = 'id,sessionId,type,agent,targetAgent,timestamp\n';
        const rows = events
          .map(
            (e) =>
              [e.id, e.sessionId, e.type, e.agent, e.targetAgent || '', e.timestamp]
                .map(escapeCsv)
                .join(','),
          )
          .join('\n');
        console.log(headers + rows);
      } else {
        console.log(JSON.stringify(events, null, 2));
      }
    });
}
