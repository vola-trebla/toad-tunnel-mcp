import { describe, it, expect } from "vitest";
import { Ssh2TunnelProvider, TunnelError } from "./ssh2-provider.js";
import type { TunnelConfig } from "./types.js";

const unreachableCfg: TunnelConfig = {
  bastion: "127.0.0.1",
  bastion_port: 19999, // nothing listening here
  username: "nobody",
  key_path: "~/.ssh/nonexistent_key_xyz",
  local_port: 15433,
  remote_host: "localhost",
  remote_port: 5432,
};

describe("Ssh2TunnelProvider", () => {
  it("getStatus returns null before any connect", () => {
    const provider = new Ssh2TunnelProvider();
    expect(provider.getStatus("prod")).toBeNull();
  });

  it("throws TunnelError when key file does not exist", async () => {
    const provider = new Ssh2TunnelProvider();
    await expect(provider.connect("prod", unreachableCfg)).rejects.toThrow(
      TunnelError,
    );
  });

  it("TunnelError message includes env name", async () => {
    const provider = new Ssh2TunnelProvider();
    await expect(provider.connect("prod", unreachableCfg)).rejects.toThrow(
      /prod/,
    );
  });

  it("disconnect is safe when no tunnel exists", async () => {
    const provider = new Ssh2TunnelProvider();
    await expect(provider.disconnect("prod")).resolves.toBeUndefined();
  });

  it("disconnectAll is safe when no tunnels exist", async () => {
    const provider = new Ssh2TunnelProvider();
    await expect(provider.disconnectAll()).resolves.toBeUndefined();
  });
});
