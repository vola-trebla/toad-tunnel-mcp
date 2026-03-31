import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new McpServer({
  name: "toad-tunnel-mcp",
  version: "0.1.0",
});

// Tools will be registered here in Phase 1

const transport = new StdioServerTransport();
await server.connect(transport);
