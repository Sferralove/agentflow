"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveCommand = serveCommand;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const server_1 = require("../server");
const routes_1 = require("../api/routes");
function serveCommand(program) {
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
        const dataDir = path_1.default.join(process.cwd(), '.agent-flow', 'data');
        if (!fs_1.default.existsSync(dataDir)) {
            console.error('Error: Run "agent-flow init" first');
            process.exit(1);
        }
        const server = new server_1.AgentFlowServer(dataDir, port);
        const store = server.getStore();
        const app = (0, express_1.default)();
        app.use((0, routes_1.createAPIRouter)(store));
        const frontendDist = path_1.default.join(__dirname, '../public');
        if (fs_1.default.existsSync(frontendDist)) {
            app.use(express_1.default.static(frontendDist));
        }
        else {
            console.log('Warning: Frontend not found. Dashboard unavailable.');
        }
        const httpServer = http_1.default.createServer(app);
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
        // Start MCP in background (stdio transport blocks)
        server.startMCP().catch(console.error);
        console.log('MCP server available via stdio');
    });
}
//# sourceMappingURL=serve.js.map