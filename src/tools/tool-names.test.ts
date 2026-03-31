import { describe, it, expect, vi } from "vitest";
import { registerExecuteQuery } from "./execute-query.js";
import { registerListNodes } from "./list-nodes.js";
import { registerGetOverview } from "./get-overview.js";
import { registerDescribeColumns } from "./describe-columns.js";
import { registerTunnelStatus } from "./tunnel-status.js";
import { SchemaCache } from "../schema/cache.js";

function makeServer() {
  return {
    registerTool: vi.fn(),
    server: { elicitInput: vi.fn() },
  };
}

function makeMinimalManager() {
  return {
    getEnvNames: () => ["dev"],
    getEnvConfig: vi.fn().mockReturnValue({
      host: "localhost",
      port: 5432,
      database: "db",
      user: "u",
      password: "p",
      permissions: "read-write" as const,
      approval: "auto" as const,
    }),
    getPool: vi.fn(),
  };
}

function makeTunnelProvider() {
  return { getStatus: vi.fn().mockReturnValue(null) };
}

describe("Tool namespace — all tools use toad_tunnel__ prefix", () => {
  const PREFIX = "toad_tunnel__";

  it("execute-query is named toad_tunnel__execute_query", () => {
    const server = makeServer();
    registerExecuteQuery(server as never, makeMinimalManager() as never);
    expect(server.registerTool.mock.calls[0][0]).toBe(`${PREFIX}execute_query`);
  });

  it("list-nodes is named toad_tunnel__list_nodes", () => {
    const server = makeServer();
    registerListNodes(server as never, makeMinimalManager() as never);
    expect(server.registerTool.mock.calls[0][0]).toBe(`${PREFIX}list_nodes`);
  });

  it("get-overview is named toad_tunnel__get_overview", () => {
    const server = makeServer();
    registerGetOverview(
      server as never,
      makeMinimalManager() as never,
      new SchemaCache(),
    );
    expect(server.registerTool.mock.calls[0][0]).toBe(`${PREFIX}get_overview`);
  });

  it("describe-columns is named toad_tunnel__describe_columns", () => {
    const server = makeServer();
    registerDescribeColumns(
      server as never,
      makeMinimalManager() as never,
      new SchemaCache(),
    );
    expect(server.registerTool.mock.calls[0][0]).toBe(
      `${PREFIX}describe_columns`,
    );
  });

  it("tunnel-status is named toad_tunnel__tunnel_status", () => {
    const server = makeServer();
    registerTunnelStatus(
      server as never,
      makeMinimalManager() as never,
      makeTunnelProvider() as never,
    );
    expect(server.registerTool.mock.calls[0][0]).toBe(`${PREFIX}tunnel_status`);
  });

  it("all 5 registered tools start with toad_tunnel__", () => {
    const server = makeServer();
    const s = server as never;
    const m = makeMinimalManager() as never;
    const cache = new SchemaCache();

    registerExecuteQuery(s, m);
    registerListNodes(s, m);
    registerGetOverview(s, m, cache);
    registerDescribeColumns(s, m, cache);
    registerTunnelStatus(s, m, makeTunnelProvider() as never);

    const names = server.registerTool.mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(names).toHaveLength(5);
    expect(names.every((n) => n.startsWith(PREFIX))).toBe(true);
  });
});
