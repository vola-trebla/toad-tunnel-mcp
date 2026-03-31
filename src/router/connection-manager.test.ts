import { describe, it, expect, afterAll } from "vitest";
import { ConnectionManager } from "./connection-manager.js";
import { UnknownEnvError, ConnectionError } from "../utils/errors.js";
import { MockTunnelProvider } from "../tunnel/mock-provider.js";
import { type Config } from "../config/schema.js";

const sandboxConfig: Config = {
  project: "test",
  environments: {
    dev: {
      host: "localhost",
      port: 5432,
      database: "sandbox_dev",
      user: "toad",
      password: "toad_secret",
      permissions: "read-write",
      approval: "auto",
    },
    dev2: {
      host: "localhost",
      port: 5432,
      database: "sandbox_dev2",
      user: "toad",
      password: "toad_secret",
      permissions: "read-write",
      approval: "auto",
    },
  },
};

const badConfig: Config = {
  project: "test",
  environments: {
    broken: {
      host: "localhost",
      port: 19999,
      database: "nonexistent",
      user: "nobody",
      password: "wrong",
      permissions: "read-write",
      approval: "auto",
    },
  },
};

describe("ConnectionManager", () => {
  const manager = new ConnectionManager(sandboxConfig);

  afterAll(async () => {
    await manager.shutdown();
  });

  it("returns pool for known env", async () => {
    const pool = await manager.getPool("dev");
    expect(pool).toBeDefined();
  });

  it("pool is created lazily — Map empty before first call", () => {
    const freshManager = new ConnectionManager(sandboxConfig);
    // @ts-expect-error accessing private for test
    expect(freshManager.pools.size).toBe(0);
  });

  it("reuses same pool on repeated calls", async () => {
    const pool1 = await manager.getPool("dev");
    const pool2 = await manager.getPool("dev");
    expect(pool1).toBe(pool2);
  });

  it("throws UnknownEnvError for unknown env", async () => {
    await expect(manager.getPool("nonexistent")).rejects.toThrow(
      UnknownEnvError,
    );
  });

  it("throws ConnectionError for bad connection config", async () => {
    const badManager = new ConnectionManager(badConfig);
    await expect(badManager.getPool("broken")).rejects.toThrow(ConnectionError);
    await badManager.shutdown();
  });

  it("executes a query on dev", async () => {
    const pool = await manager.getPool("dev");
    const result = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM products",
    );
    expect(result.rows[0].cnt).toBeGreaterThan(0);
  });

  it("getEnvNames returns all configured envs", () => {
    expect(manager.getEnvNames()).toEqual(["dev", "dev2"]);
  });

  it("shutdown closes all pools", async () => {
    const tempManager = new ConnectionManager(sandboxConfig);
    await tempManager.getPool("dev");
    await tempManager.getPool("dev2");
    await tempManager.shutdown();
    // @ts-expect-error accessing private for test
    expect(tempManager.pools.size).toBe(0);
  });
});

const tunnelConfig: Config = {
  project: "test",
  environments: {
    dev: {
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
        local_port: 5432, // mock will redirect here — resolves to sandbox_dev
        remote_host: "localhost",
        remote_port: 5432,
      },
    },
  },
};

describe("ConnectionManager with TunnelProvider", () => {
  it("no tunnels open at startup — provider has 0 active tunnels", () => {
    const provider = new MockTunnelProvider();
    new ConnectionManager(tunnelConfig, provider);
    expect(provider.getStatus("tunneled")).toBeNull();
  });

  it("tunnel opens lazily on first getPool() call for tunneled env", async () => {
    const provider = new MockTunnelProvider();
    const manager = new ConnectionManager(tunnelConfig, provider);

    expect(provider.getStatus("tunneled")).toBeNull();
    await manager.getPool("tunneled");
    expect(provider.getStatus("tunneled")?.status).toBe("active");

    await manager.shutdown();
  });

  it("non-tunneled env does not open a tunnel", async () => {
    const provider = new MockTunnelProvider();
    const manager = new ConnectionManager(tunnelConfig, provider);

    await manager.getPool("dev");
    expect(provider.getStatus("dev")).toBeNull();

    await manager.shutdown();
  });

  it("shutdown calls disconnectAll on the tunnel provider", async () => {
    const provider = new MockTunnelProvider();
    const manager = new ConnectionManager(tunnelConfig, provider);
    await manager.getPool("tunneled");
    await manager.shutdown();
    expect(provider.getStatus("tunneled")).toBeNull();
  });

  it("invalidatePool removes the cached pool", async () => {
    const provider = new MockTunnelProvider();
    const manager = new ConnectionManager(tunnelConfig, provider);
    const pool1 = await manager.getPool("tunneled");
    manager.invalidatePool("tunneled");
    // @ts-expect-error accessing private for test
    expect(manager.pools.has("tunneled")).toBe(false);
    const pool2 = await manager.getPool("tunneled");
    expect(pool2).not.toBe(pool1);
    await manager.shutdown();
  });

  it("onReconnect callback invalidates and recreates pool", async () => {
    let onReconnect: (env: string) => void = () => {};
    const provider = new MockTunnelProvider();
    const manager = new ConnectionManager(tunnelConfig, provider);
    // Manually wire the callback (as index.ts would do)
    onReconnect = (env) => manager.invalidatePool(env);

    const pool1 = await manager.getPool("tunneled");
    onReconnect("tunneled");
    // @ts-expect-error accessing private for test
    expect(manager.pools.has("tunneled")).toBe(false);
    const pool2 = await manager.getPool("tunneled");
    expect(pool2).not.toBe(pool1);
    await manager.shutdown();
  });
});
