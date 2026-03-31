import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/loader.js";
import { ConnectionManager } from "./router/connection-manager.js";
import { Ssh2TunnelProvider } from "./tunnel/ssh2-provider.js";
import { SchemaCache } from "./schema/cache.js";
import { registerExecuteQuery } from "./tools/execute-query.js";
import { registerListNodes } from "./tools/list-nodes.js";
import { registerGetOverview } from "./tools/get-overview.js";
import { registerDescribeColumns } from "./tools/describe-columns.js";
import { registerTunnelStatus } from "./tools/tunnel-status.js";

const CONFIG_PATH = process.env["TOAD_CONFIG"] ?? "config/toad-tunnel.yaml";

const config = loadConfig(CONFIG_PATH);

const hasTunnels = Object.values(config.environments).some((e) => e.tunnel);
const tunnelProvider = hasTunnels
  ? new Ssh2TunnelProvider(config.tunnel_options)
  : undefined;
const connectionManager = new ConnectionManager(config, tunnelProvider);

// Wire onReconnect: tunnel provider notifies manager to drop stale pool
if (tunnelProvider) {
  tunnelProvider.onReconnect = (env) => connectionManager.invalidatePool(env);
}

const schemaCache = new SchemaCache();

const server = new McpServer({
  name: "toad-tunnel-mcp",
  version: "0.1.0",
});

registerListNodes(server, connectionManager);
registerGetOverview(server, connectionManager, schemaCache);
registerDescribeColumns(server, connectionManager, schemaCache);
registerExecuteQuery(server, connectionManager);
if (tunnelProvider) {
  registerTunnelStatus(server, connectionManager, tunnelProvider);
}

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
