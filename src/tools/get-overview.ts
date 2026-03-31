import * as z from "zod/v4";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConnectionManager } from "../router/connection-manager.js";
import { type SchemaCache } from "../schema/cache.js";
import { queryTables } from "../schema/queries.js";
import { formatTablesAsTsv } from "../schema/formatter.js";
import { toolError } from "../utils/tool-result.js";
import { envEnum } from "../utils/env-enum.js";

export function registerGetOverview(
  server: McpServer,
  connectionManager: ConnectionManager,
  cache: SchemaCache,
): void {
  const envNames = connectionManager.getEnvNames();

  server.registerTool(
    "toad_tunnel__get_overview",
    {
      description:
        "Get a TSV overview of all tables in an environment with estimated row counts. " +
        "Results are cached for 5 minutes. " +
        `Available environments: ${envNames.join(", ")}.`,
      inputSchema: z.object({
        env: envEnum(envNames).describe("Target environment"),
      }),
    },
    async ({ env }) => {
      try {
        const cacheKey = `overview:${env}`;
        const cached = cache.get<string>(cacheKey);
        if (cached) {
          return { content: [{ type: "text", text: cached }] };
        }

        const pool = await connectionManager.getPool(env);
        const tables = await queryTables(pool);
        const text = formatTablesAsTsv(tables);

        cache.set(cacheKey, text);
        return { content: [{ type: "text", text }] };
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
