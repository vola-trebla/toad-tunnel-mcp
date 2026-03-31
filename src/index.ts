import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/loader.js";
import { ConnectionManager } from "./router/connection-manager.js";
import { registerExecuteQuery } from "./tools/execute-query.js";

const CONFIG_PATH = process.env["TOAD_CONFIG"] ?? "config/toad-tunnel.yaml";

const config = loadConfig(CONFIG_PATH);
const connectionManager = new ConnectionManager(config);

const server = new McpServer({
  name: "toad-tunnel-mcp",
  version: "0.1.0",
});

registerExecuteQuery(server, connectionManager);

process.on("SIGINT", async () => {
  await connectionManager.shutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await connectionManager.shutdown();
  process.exit(0);
});

const transport = new StdioServerTransport();
await server.connect(transport);
