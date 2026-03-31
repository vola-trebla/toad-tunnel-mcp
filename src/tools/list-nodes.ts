import * as z from "zod/v4";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConnectionManager } from "../router/connection-manager.js";
import { ToadError } from "../utils/errors.js";

export function registerListNodes(
  server: McpServer,
  connectionManager: ConnectionManager,
): void {
  const envNames = connectionManager.getEnvNames();

  server.registerTool(
    "toad_tunnel__list_nodes",
    {
      description:
        "List all available environments and their database info. " +
        "Call this first to discover what's available before querying. " +
        "Returns env names, databases, permissions, and approval mode.",
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const lines: string[] = ["env\tdatabase\tpermissions\tapproval"];
        for (const env of envNames) {
          // Access config through connection manager
          const cfg = connectionManager.getEnvConfig(env);
          lines.push(
            `${env}\t${cfg.database}\t${cfg.permissions}\t${cfg.approval}`,
          );
        }
        return {
          content: [{ type: "text" as const, text: lines.join("\n") }],
        };
      } catch (err) {
        const message = err instanceof ToadError ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Error: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
