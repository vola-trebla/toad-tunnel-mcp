import { describe, it, expect, vi } from "vitest";
import { ConnectionManager } from "./connection-manager.js";
import { UnknownEnvError } from "../utils/errors.js";
import type { Config } from "../config/schema.js";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    project: "test",
    environments: {
      dev: {
        host: "localhost",
        port: 5432,
        database: "testdb",
        user: "u",
        password: "p",
        permissions: "read-write",
        approval: "auto",
      },
      staging: {
        host: "staging.internal",
        port: 5432,
        database: "stagedb",
        user: "s",
        password: "sp",
        permissions: "read-only",
        approval: "hitl",
      },
    },
    ...overrides,
  };
}

describe("ConnectionManager", () => {
  describe("getEnvNames", () => {
    it("returns all configured environment names", () => {
      const cm = new ConnectionManager(makeConfig());
      expect(cm.getEnvNames()).toEqual(["dev", "staging"]);
    });
  });

  describe("getEnvConfig", () => {
    it("returns config for a valid env", () => {
      const cm = new ConnectionManager(makeConfig());
      const cfg = cm.getEnvConfig("dev");
      expect(cfg.host).toBe("localhost");
      expect(cfg.permissions).toBe("read-write");
    });

    it("throws UnknownEnvError for invalid env", () => {
      const cm = new ConnectionManager(makeConfig());
      expect(() => cm.getEnvConfig("prod")).toThrow(UnknownEnvError);
    });
  });

  describe("invalidatePool", () => {
    it("does not throw for non-existing pool", () => {
      const cm = new ConnectionManager(makeConfig());
      expect(() => cm.invalidatePool("dev")).not.toThrow();
    });
  });

  describe("shutdown", () => {
    it("completes without error when no pools exist", async () => {
      const cm = new ConnectionManager(makeConfig());
      await expect(cm.shutdown()).resolves.toBeUndefined();
    });

    it("calls disconnectAll on tunnel provider", async () => {
      const tunnelProvider = {
        connect: vi.fn(),
        disconnect: vi.fn(),
        disconnectAll: vi.fn().mockResolvedValue(undefined),
        getStatus: vi.fn(),
      };
      const cm = new ConnectionManager(makeConfig(), tunnelProvider);
      await cm.shutdown();
      expect(tunnelProvider.disconnectAll).toHaveBeenCalled();
    });
  });

  describe("getPool", () => {
    it("throws UnknownEnvError for unknown env", async () => {
      const cm = new ConnectionManager(makeConfig());
      await expect(cm.getPool("prod")).rejects.toThrow(UnknownEnvError);
    });
  });
});
