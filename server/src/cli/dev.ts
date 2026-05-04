import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';

export function devCommand(program: Command): void {
  program
    .command('dev')
    .description('Start the agent-flow server with auto-restart on code changes')
    .option('-p, --port <number>', 'HTTP + WebSocket port', '3001')
    .option('-w, --watch <path>', 'Watch directory for changes')
    .action(async (options) => {
      const port = parseInt(options.port, 10);
      // Default watch: agent-flow's own dist directory (not CWD)
      const watchDir = path.resolve(options.watch || path.resolve(__dirname, '../../dist'));

      if (!fs.existsSync(watchDir)) {
        console.log(`Watch directory not found: ${watchDir}`);
        console.log('Falling back to serve mode without watch.');
      }

      console.log(`Watching: ${watchDir}`);
      console.log(`Port: ${port}`);

      const serveScript = path.resolve(__dirname, 'index.js');
      let child: ChildProcess | null = null;
      let restarting = false;

      const startServer = () => {
        if (child) {
          child.kill('SIGTERM');
        }
        child = spawn('node', [serveScript, 'serve', '--port', String(port)], {
          stdio: 'inherit',
          env: { ...process.env, FORCE_COLOR: '1' },
        });
        child.on('exit', (code) => {
          if (!restarting && code !== 0) {
            console.log(`Server exited with code ${code}. Waiting for changes...`);
          }
        });
      };

      startServer();

      // Watch for changes and restart
      if (fs.existsSync(watchDir)) {
        let debounce: ReturnType<typeof setTimeout>;
        fs.watch(watchDir, { recursive: true }, (_event, filename) => {
          if (!filename || filename.startsWith('public/')) return; // skip frontend public
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            restarting = true;
            console.log(`\n📁 Changed: ${filename}`);
            console.log('🔄 Restarting server...\n');
            startServer();
            restarting = false;
          }, 300); // Debounce 300ms
        });
      }
    });
}
