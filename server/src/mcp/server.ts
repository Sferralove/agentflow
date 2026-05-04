import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { EventStore } from '../types';
import { createMCPTools } from './tools';

export class AgentFlowMCPServer {
  private server: McpServer;
  private store: EventStore;

  constructor(store: EventStore) {
    this.store = store;
    this.server = new McpServer({
      name: 'agent-flow',
      version: '0.1.0',
    });

    this.registerTools();
  }

  private registerTools(): void {
    const tools = createMCPTools(this.store);

    for (const [name, tool] of Object.entries(tools)) {
      this.server.tool(
        name,
        tool.description,
        tool.inputSchema,
        tool.handler,
      );
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Agent Flow MCP server started');
  }

  async stop(): Promise<void> {
    // StdioServerTransport doesn't have a close method, but we can log
    console.error('Agent Flow MCP server stopped');
  }
}
