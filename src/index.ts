#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
import { QueryValidator } from "./safety/query-validator.js";
import { AuditLogger } from "./audit/logger.js";

// ---------------------------------------------------------------------------
// CLI argument handling
// ---------------------------------------------------------------------------

function readVersion(): string {
  try {
    const pkgPath = join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "package.json",
    );
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return "0.0.0";
  }
}

const VERSION = readVersion();

function getConfigPath(argv: string[]): string {
  const idx = argv.indexOf("--config");
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1]!;
  return process.env["TOAD_CONFIG"] ?? "config/toad-tunnel.yaml";
}

const cliArgs = process.argv.slice(2);

if (cliArgs.includes("--version") || cliArgs.includes("-v")) {
  console.log(`toad-tunnel-mcp v${VERSION}`);
  process.exit(0);
}

if (cliArgs.includes("--help") || cliArgs.includes("-h")) {
  console.log(`toad-tunnel-mcp v${VERSION}
Multi-environment PostgreSQL MCP router with SSH tunnel management.

Usage:
  toad-tunnel-mcp [--config <path>]            Start MCP server (stdio transport)
  toad-tunnel-mcp validate [--config <path>]   Validate config and exit
  toad-tunnel-mcp --version                    Print version and exit
  toad-tunnel-mcp --help                       Print this help

Options:
  --config <path>   Config file path (default: config/toad-tunnel.yaml)
                    Can also be set via TOAD_CONFIG environment variable

Config format: YAML. See config/toad-tunnel.example.yaml for a full example.`);
  process.exit(0);
}

if (cliArgs[0] === "validate") {
  const configPath = getConfigPath(cliArgs.slice(1));
  try {
    const config = loadConfig(configPath);
    const envNames = Object.keys(config.environments);
    console.log(
      `\u2713 Config valid \u2014 ${envNames.length} environment${envNames.length !== 1 ? "s" : ""}: ${envNames.join(", ")}`,
    );
    for (const [name, env] of Object.entries(config.environments)) {
      const tunnel = env.tunnel ? "tunnel" : "direct";
      console.log(
        `  ${name.padEnd(12)} ${env.permissions.padEnd(12)} approval:${env.approval}  ${tunnel}`,
      );
    }
    process.exit(0);
  } catch (err) {
    console.error(
      `\u2717 Config invalid: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// MCP server startup
// ---------------------------------------------------------------------------

const CONFIG_PATH = getConfigPath(cliArgs);

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
  version: VERSION,
});

registerListNodes(server, connectionManager);
registerGetOverview(server, connectionManager, schemaCache);
registerDescribeColumns(server, connectionManager, schemaCache);
const validator = new QueryValidator(config.safety);
const auditLogger = new AuditLogger(config.safety?.audit_log_file);
registerExecuteQuery(server, connectionManager, validator, auditLogger);
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
