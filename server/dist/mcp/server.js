"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentFlowMCPServer = void 0;
const mcp_js_1 = require("@modelcontextprotocol/sdk/server/mcp.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const tools_1 = require("./tools");
class AgentFlowMCPServer {
    server;
    store;
    constructor(store) {
        this.store = store;
        this.server = new mcp_js_1.McpServer({
            name: 'agent-flow',
            version: '0.1.0',
        });
        this.registerTools();
    }
    registerTools() {
        const tools = (0, tools_1.createMCPTools)(this.store);
        for (const [name, tool] of Object.entries(tools)) {
            this.server.tool(name, tool.description, tool.inputSchema, tool.handler);
        }
    }
    async start() {
        const transport = new stdio_js_1.StdioServerTransport();
        await this.server.connect(transport);
        console.error('Agent Flow MCP server started');
    }
    async stop() {
        // StdioServerTransport doesn't have a close method, but we can log
        console.error('Agent Flow MCP server stopped');
    }
}
exports.AgentFlowMCPServer = AgentFlowMCPServer;
//# sourceMappingURL=server.js.map