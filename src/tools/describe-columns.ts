import * as z from "zod/v4";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConnectionManager } from "../router/connection-manager.js";
import { type SchemaCache } from "../schema/cache.js";
import { queryColumns } from "../schema/queries.js";
import { formatColumnsCompact } from "../schema/formatter.js";
import { ToadError } from "../utils/errors.js";

export function registerDescribeColumns(
  server: McpServer,
  connectionManager: ConnectionManager,
  cache: SchemaCache,
): void {
  const envNames = connectionManager.getEnvNames();

  server.registerTool(
    "toad_tunnel__describe_columns",
    {
      description:
        "Get compact column schema for a table: name:type[:PK][:UNIQUE][:NOT NULL][:DEFAULT=val]. " +
        "Results are cached for 5 minutes. " +
        `Available environments: ${envNames.join(", ")}.`,
      inputSchema: z.object({
        env: z
          .enum(envNames as [string, ...string[]])
          .describe("Target environment"),
        schema: z.string().default("public").describe("PostgreSQL schema name"),
        table: z.string().describe("Table name"),
      }),
    },
    async ({ env, schema, table }) => {
      try {
        const cacheKey = `columns:${env}:${schema}.${table}`;
        const cached = cache.get<string>(cacheKey);
        if (cached) {
          return { content: [{ type: "text" as const, text: cached }] };
        }

        const pool = await connectionManager.getPool(env);
        const columns = await queryColumns(pool, schema, table);

        if (columns.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Table "${schema}.${table}" not found or has no columns`,
              },
            ],
            isError: true,
          };
        }

        const text = formatColumnsCompact(columns);
        cache.set(cacheKey, text);
        return { content: [{ type: "text" as const, text }] };
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
