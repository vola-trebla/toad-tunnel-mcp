import * as z from "zod/v4";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConnectionManager } from "../router/connection-manager.js";
import { type QueryValidator } from "../safety/query-validator.js";
import { executeQuery } from "../router/query-executor.js";
import { toolError } from "../utils/tool-result.js";
import { envEnum } from "../utils/env-enum.js";

const SQL_PREVIEW_MAX = 500;

/** Truncate SQL for display in the elicitation prompt */
function sqlPreview(sql: string): string {
  const trimmed = sql.trim();
  if (trimmed.length <= SQL_PREVIEW_MAX) return trimmed;
  return trimmed.slice(0, SQL_PREVIEW_MAX) + "\n… (truncated)";
}

export function registerExecuteQuery(
  server: McpServer,
  connectionManager: ConnectionManager,
  validator?: QueryValidator,
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
        const envConfig = connectionManager.getEnvConfig(env);

        // Layer 3: HITL confirmation for environments that require it
        if (envConfig.approval === "hitl") {
          const timeoutMs = validator?.hitlTimeoutMs ?? 60_000;

          let elicitResult: {
            action: string;
            content?: Record<string, unknown>;
          };
          try {
            elicitResult = await Promise.race([
              server.server.elicitInput({
                message:
                  `Environment **${env}** requires your approval before executing.\n\n` +
                  `\`\`\`sql\n${sqlPreview(sql)}\n\`\`\`\n\n` +
                  `Approve to proceed.`,
                requestedSchema: {
                  type: "object" as const,
                  properties: {
                    confirmed: {
                      type: "boolean",
                      title: "Approve query",
                      description: "Check to approve execution",
                      default: false,
                    },
                  },
                  required: ["confirmed"],
                },
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error("HITL_TIMEOUT")),
                  timeoutMs,
                ).unref(),
              ),
            ]);
          } catch (err) {
            const msg =
              err instanceof Error && err.message === "HITL_TIMEOUT"
                ? `Query rejected: approval timed out after ${timeoutMs / 1000}s.`
                : `Query rejected: elicitation failed (${err instanceof Error ? err.message : String(err)}).`;
            return { content: [{ type: "text", text: msg }] };
          }

          if (elicitResult.action !== "accept") {
            return {
              content: [
                {
                  type: "text",
                  text: `Query rejected: user ${elicitResult.action === "decline" ? "declined" : "cancelled"} approval.`,
                },
              ],
            };
          }

          if (!elicitResult.content?.["confirmed"]) {
            return {
              content: [
                {
                  type: "text",
                  text: "Query rejected: approval checkbox was not checked.",
                },
              ],
            };
          }
        }

        const result = await executeQuery(
          connectionManager,
          env,
          sql,
          validator,
        );

        if (result.rowCount === 0 && !result.truncated) {
          return { content: [{ type: "text", text: "(no rows)" }] };
        }

        const lines = result.rows.map((row) => JSON.stringify(row));

        if (result.truncated) {
          lines.push(
            `\n[${result.rowCount}+ rows — showing first ${result.rowCount}. ` +
              `Add LIMIT or WHERE to narrow results.]`,
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
