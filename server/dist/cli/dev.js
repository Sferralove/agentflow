"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.devCommand = devCommand;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
function devCommand(program) {
    program
        .command('dev')
        .description('Start the agent-flow server with auto-restart on code changes')
        .option('-p, --port <number>', 'HTTP + WebSocket port', '3001')
        .option('-w, --watch <path>', 'Watch directory for changes')
        .action(async (options) => {
        const port = parseInt(options.port, 10);
        // Default watch: agent-flow's own dist directory (not CWD)
        const watchDir = path_1.default.resolve(options.watch || path_1.default.resolve(__dirname, '../../dist'));
        if (!fs_1.default.existsSync(watchDir)) {
            console.log(`Watch directory not found: ${watchDir}`);
            console.log('Falling back to serve mode without watch.');
        }
        console.log(`Watching: ${watchDir}`);
        console.log(`Port: ${port}`);
        const serveScript = path_1.default.resolve(__dirname, 'index.js');
        let child = null;
        let restarting = false;
        const startServer = () => {
            if (child) {
                child.kill('SIGTERM');
            }
            child = (0, child_process_1.spawn)('node', [serveScript, 'serve', '--port', String(port)], {
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
        if (fs_1.default.existsSync(watchDir)) {
            let debounce;
            fs_1.default.watch(watchDir, { recursive: true }, (_event, filename) => {
                if (!filename || filename.startsWith('public/'))
                    return; // skip frontend public
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
//# sourceMappingURL=dev.js.map