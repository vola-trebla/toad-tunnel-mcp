import * as z from "zod/v4";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConnectionManager } from "../router/connection-manager.js";
import { executeQuery } from "../router/query-executor.js";
import { toolError } from "../utils/tool-result.js";
import { envEnum } from "../utils/env-enum.js";

export function registerExecuteQuery(
  server: McpServer,
  connectionManager: ConnectionManager,
): void {
  const envNames = connectionManager.getEnvNames();

  server.registerTool(
    "toad_tunnel__execute_query",
    {
      description:
        "Execute a SQL query against a specific environment. " +
        `Available environments: ${envNames.join(", ")}. ` +
        "The database is resolved automatically from the environment config.",
      inputSchema: z.object({
        env: envEnum(envNames).describe("Target environment"),
        sql: z.string().describe("SQL query to execute"),
      }),
    },
    async ({ env, sql }) => {
      try {
        const result = await executeQuery(connectionManager, env, sql);
        const text =
          result.rowCount === 0
            ? "(no rows)"
            : result.rows.map((row) => JSON.stringify(row)).join("\n");

        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
