"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pluginCommand = pluginCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
function pluginCommand(program) {
    program
        .command('plugin')
        .description('Deploy the agent-flow plugin for automatic monitoring')
        .argument('[action]', 'Action: deploy (default)')
        .action(async (action) => {
        const act = action || 'deploy';
        if (act === 'deploy') {
            // Source: look in bundled dist/plugin/ first (npm install), then monorepo plugin/src/
            const bundled = path_1.default.resolve(__dirname, '../plugin');
            const monorepo = path_1.default.resolve(__dirname, '../../../plugin/src');
            let source = '';
            if (fs_1.default.existsSync(bundled)) {
                source = bundled;
            }
            else if (fs_1.default.existsSync(monorepo)) {
                source = monorepo;
            }
            else {
                console.error('Error: Plugin source not found.');
                console.error(`Tried: ${bundled}`);
                console.error(`Tried: ${monorepo}`);
                console.error('');
                console.error('Install the plugin package:');
                console.error('  npm install -D agent-flow-plugin');
                process.exit(1);
            }
            // Target: .opencode/plugins/agent-flow/
            const target = path_1.default.join(process.cwd(), '.opencode', 'plugins', 'agent-flow');
            // Copy files recursively
            function copyDir(src, dest) {
                if (!fs_1.default.existsSync(dest))
                    fs_1.default.mkdirSync(dest, { recursive: true });
                for (const entry of fs_1.default.readdirSync(src, { withFileTypes: true })) {
                    const srcPath = path_1.default.join(src, entry.name);
                    const destPath = path_1.default.join(dest, entry.name);
                    if (entry.isDirectory()) {
                        copyDir(srcPath, destPath);
                    }
                    else {
                        fs_1.default.copyFileSync(srcPath, destPath);
                    }
                }
            }
            copyDir(source, target);
            // Create package.json for OpenCode to recognize it
            const pkgPath = path_1.default.join(target, 'package.json');
            if (!fs_1.default.existsSync(pkgPath)) {
                fs_1.default.writeFileSync(pkgPath, JSON.stringify({
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
        }
        else {
            console.log(`Unknown action: ${act}`);
            console.log('Usage: npx agent-flow plugin deploy');
        }
    });
}
//# sourceMappingURL=plugin.js.map