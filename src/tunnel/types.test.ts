import { describe, it, expect, beforeEach } from "vitest";
import { MockTunnelProvider } from "./mock-provider.js";
import type { TunnelConfig } from "./types.js";

const cfg: TunnelConfig = {
  bastion: "bastion.example.com",
  bastion_port: 22,
  key_path: "~/.ssh/id_rsa",
  local_port: 5433,
  remote_host: "localhost",
  remote_port: 5432,
};

describe("TunnelProvider contract (via MockTunnelProvider)", () => {
  let provider: MockTunnelProvider;

  beforeEach(() => {
    provider = new MockTunnelProvider();
  });

  it("getStatus returns null before connect", () => {
    expect(provider.getStatus("stage")).toBeNull();
  });

  it("connect returns active tunnel", async () => {
    const tunnel = await provider.connect("stage", cfg);
    expect(tunnel.env).toBe("stage");
    expect(tunnel.status).toBe("active");
    expect(tunnel.local_port).toBe(5433);
  });

  it("getStatus returns tunnel after connect", async () => {
    await provider.connect("stage", cfg);
    const status = provider.getStatus("stage");
    expect(status).not.toBeNull();
    expect(status?.status).toBe("active");
  });

  it("connect is idempotent — returns same tunnel on second call", async () => {
    const t1 = await provider.connect("stage", cfg);
    const t2 = await provider.connect("stage", cfg);
    expect(t1).toBe(t2);
  });

  it("disconnect removes the tunnel", async () => {
    await provider.connect("stage", cfg);
    await provider.disconnect("stage");
    expect(provider.getStatus("stage")).toBeNull();
  });

  it("disconnect is safe when tunnel does not exist", async () => {
    await expect(provider.disconnect("nope")).resolves.toBeUndefined();
  });

  it("disconnectAll clears all tunnels", async () => {
    await provider.connect("stage", cfg);
    await provider.connect("prod", { ...cfg, local_port: 5434 });
    await provider.disconnectAll();
    expect(provider.getStatus("stage")).toBeNull();
    expect(provider.getStatus("prod")).toBeNull();
  });

  it("simulateDrop sets status to disconnected", async () => {
    await provider.connect("stage", cfg);
    provider.simulateDrop("stage");
    expect(provider.getStatus("stage")?.status).toBe("disconnected");
  });

  it("connect after drop creates a new active tunnel", async () => {
    await provider.connect("stage", cfg);
    provider.simulateDrop("stage");
    const tunnel = await provider.connect("stage", cfg);
    expect(tunnel.status).toBe("active");
  });
});
