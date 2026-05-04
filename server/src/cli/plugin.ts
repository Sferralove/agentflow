import { Command } from 'commander';
import fs from 'fs';
import path from 'path';

export function pluginCommand(program: Command): void {
  program
    .command('plugin')
    .description('Deploy the agent-flow plugin for automatic monitoring')
    .argument('[action]', 'Action: deploy (default)')
    .action(async (action: string) => {
      const act = action || 'deploy';

      if (act === 'deploy') {
        // Source: look in bundled dist/plugin/ first (npm install), then monorepo plugin/src/
        const bundled = path.resolve(__dirname, '../plugin');
        const monorepo = path.resolve(__dirname, '../../../plugin/src');

        let source = '';
        if (fs.existsSync(bundled)) {
          source = bundled;
        } else if (fs.existsSync(monorepo)) {
          source = monorepo;
        } else {
          console.error('Error: Plugin source not found.');
          console.error(`Tried: ${bundled}`);
          console.error(`Tried: ${monorepo}`);
          console.error('');
          console.error('Install the plugin package:');
          console.error('  npm install -D agent-flow-plugin');
          process.exit(1);
        }

        // Target: .opencode/plugins/agent-flow/
        const target = path.join(process.cwd(), '.opencode', 'plugins', 'agent-flow');

        // Copy files recursively
        function copyDir(src: string, dest: string) {
          if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
          for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              copyDir(srcPath, destPath);
            } else {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        }

        copyDir(source, target);

        // Create package.json for OpenCode to recognize it
        const pkgPath = path.join(target, 'package.json');
        if (!fs.existsSync(pkgPath)) {
          fs.writeFileSync(pkgPath, JSON.stringify({
            name: 'agent-flow-plugin',
            version: '0.1.0',
            type: 'module',
            main: 'index.js',
          }, null, 2));
        }

        console.log(`✓ Plugin deployed to ${target}`);
        console.log('');
        console.log('The plugin will auto-monitor all OpenCode activity.');
        console.log('No configuration needed — .opencode/plugins/ is auto-discovered.');
        console.log('');
        console.log('Next: start the dashboard');
        console.log('  npx agent-flow serve');
      } else {
        console.log(`Unknown action: ${act}`);
        console.log('Usage: npx agent-flow plugin deploy');
      }
    });
}
