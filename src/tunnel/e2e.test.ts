/**
 * Phase 3d integration tests.
 * Uses MockTunnelProvider + real sandbox DB to test mixed-config routing,
 * concurrent queries, tunnel_status transitions, and graceful shutdown.
 */
import { describe, it, expect, afterAll } from "vitest";
import { ConnectionManager } from "../router/connection-manager.js";
import { MockTunnelProvider } from "./mock-provider.js";
import { type Config } from "../config/schema.js";

// Mixed config: one direct env, one tunneled env (both backed by sandbox_dev)
const mixedConfig: Config = {
  project: "e2e-test",
  environments: {
    direct: {
      host: "localhost",
      port: 5432,
      database: "sandbox_dev",
      user: "toad",
      password: "toad_secret",
      permissions: "read-write",
      approval: "auto",
    },
    tunneled: {
      host: "remote-db.internal",
      port: 5432,
      database: "sandbox_dev",
      user: "toad",
      password: "toad_secret",
      permissions: "read-only",
      approval: "auto",
      tunnel: {
        bastion: "bastion.example.com",
        bastion_port: 22,
        username: "deploy",
        key_path: "~/.ssh/id_rsa",
        local_port: 5432,
        remote_host: "localhost",
        remote_port: 5432,
      },
    },
  },
};

describe("Phase 3d: integration", () => {
  const provider = new MockTunnelProvider();
  const manager = new ConnectionManager(mixedConfig, provider);

  afterAll(async () => {
    await manager.shutdown();
  });

  it("direct env queries without opening a tunnel", async () => {
    const pool = await manager.getPool("direct");
    const result = await pool.query("SELECT 1 AS n");
    expect(result.rows[0].n).toBe(1);
    expect(provider.getStatus("direct")).toBeNull();
  });

  it("tunneled env opens tunnel lazily on first query", async () => {
    expect(provider.getStatus("tunneled")).toBeNull();
    const pool = await manager.getPool("tunneled");
    expect(provider.getStatus("tunneled")?.status).toBe("active");
    const result = await pool.query("SELECT 1 AS n");
    expect(result.rows[0].n).toBe(1);
  });

  it("concurrent queries to both envs do not interfere", async () => {
    const [r1, r2] = await Promise.all([
      manager.getPool("direct").then((p) => p.query("SELECT 2 AS n")),
      manager.getPool("tunneled").then((p) => p.query("SELECT 3 AS n")),
    ]);
    expect(r1.rows[0].n).toBe(2);
    expect(r2.rows[0].n).toBe(3);
  });

  it("tunnel_status: direct env shows 'none', tunneled shows 'active'", () => {
    const directCfg = manager.getEnvConfig("direct");
    const tunneledStatus = provider.getStatus("tunneled");

    expect(directCfg.tunnel).toBeUndefined();
    expect(tunneledStatus?.status).toBe("active");
    expect(tunneledStatus?.local_port).toBe(5432);
  });

  it("after simulateDrop, tunnel status becomes 'disconnected'", () => {
    provider.simulateDrop("tunneled");
    expect(provider.getStatus("tunneled")?.status).toBe("disconnected");
  });

  it("invalidatePool after drop allows pool recreation on next getPool()", async () => {
    // drop is already simulated above; now reconnect via mock
    await provider.connect("tunneled", {
      bastion: "bastion.example.com",
      bastion_port: 22,
      username: "deploy",
      key_path: "~/.ssh/id_rsa",
      local_port: 5432,
      remote_host: "localhost",
      remote_port: 5432,
    });
    manager.invalidatePool("tunneled");

    const pool = await manager.getPool("tunneled");
    const result = await pool.query("SELECT 42 AS n");
    expect(result.rows[0].n).toBe(42);
    expect(provider.getStatus("tunneled")?.status).toBe("active");
  });

  it("shutdown closes pools and calls disconnectAll", async () => {
    const tempProvider = new MockTunnelProvider();
    const tempManager = new ConnectionManager(mixedConfig, tempProvider);
    await tempManager.getPool("direct");
    await tempManager.getPool("tunneled");

    await tempManager.shutdown();

    // @ts-expect-error accessing private for test
    expect(tempManager.pools.size).toBe(0);
    expect(tempProvider.getStatus("tunneled")).toBeNull();
  });
});
