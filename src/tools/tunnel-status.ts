import * as z from "zod/v4";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ConnectionManager } from "../router/connection-manager.js";
import { type TunnelProvider } from "../tunnel/types.js";

export function registerTunnelStatus(
  server: McpServer,
  connectionManager: ConnectionManager,
  tunnelProvider: TunnelProvider,
): void {
  const envNames = connectionManager.getEnvNames();

  server.registerTool(
    "toad_tunnel__tunnel_status",
    {
      description:
        "Show SSH tunnel status for all environments. " +
        "Useful for debugging slow queries — check if a tunnel is reconnecting. " +
        "Envs without a tunnel config show status 'none'.",
      inputSchema: z.object({}),
    },
    async () => {
      const lines: string[] = [
        "env\tstatus\tlocal_port\tuptime_s\tlast_query_at",
      ];

      for (const env of envNames) {
        const cfg = connectionManager.getEnvConfig(env);
        if (!cfg.tunnel) {
          lines.push(`${env}\tnone\t-\t-\t-`);
          continue;
        }

        const tunnel = tunnelProvider.getStatus(env);
        if (!tunnel) {
          lines.push(`${env}\tdisconnected\t${cfg.tunnel.local_port}\t-\t-`);
          continue;
        }

        const uptimeSec = Math.floor(
          (Date.now() - tunnel.connected_at.getTime()) / 1000,
        );
        const lastQuery = tunnel.last_query_at.toISOString();
        lines.push(
          `${env}\t${tunnel.status}\t${tunnel.local_port}\t${uptimeSec}\t${lastQuery}`,
        );
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    },
  );
}
