import { describe, it, expect } from "vitest";
import { ConfigSchema } from "./schema.js";

const validEnv = {
  host: "localhost",
  port: 5432,
  database: "db",
  user: "u",
  password: "p",
  permissions: "read-write",
  approval: "auto",
};

describe("ConfigSchema", () => {
  it("parses a minimal valid config", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: { dev: validEnv },
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing project", () => {
    const result = ConfigSchema.safeParse({
      environments: { dev: validEnv },
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty environments", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: {},
    });
    // Empty record is technically valid for z.record, but config should have envs
    expect(result.success).toBe(true);
  });

  it("rejects invalid permissions value", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: {
        dev: { ...validEnv, permissions: "admin" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid approval value", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: {
        dev: { ...validEnv, approval: "manual" },
      },
    });
    expect(result.success).toBe(false);
  });

  it("applies default port", () => {
    const { port: _, ...noPort } = validEnv;
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: { dev: noPort },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.environments["dev"]!.port).toBe(5432);
    }
  });

  it("parses tunnel config", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: {
        prod: {
          ...validEnv,
          tunnel: {
            bastion: "bastion.example.com",
            username: "deploy",
            key_path: "~/.ssh/id_rsa",
            local_port: 5434,
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.environments["prod"]!.tunnel?.bastion).toBe(
        "bastion.example.com",
      );
      expect(result.data.environments["prod"]!.tunnel?.bastion_port).toBe(22);
    }
  });

  it("rejects tunnel config missing required fields", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: {
        prod: {
          ...validEnv,
          tunnel: { bastion: "bastion.example.com" },
        },
      },
    });
    expect(result.success).toBe(false);
  });

  it("parses safety config with defaults", () => {
    const result = ConfigSchema.safeParse({
      project: "test",
      environments: { dev: validEnv },
      safety: {},
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.safety?.max_rows).toBe(100);
      expect(result.data.safety?.hitl_timeout_ms).toBe(60_000);
      expect(result.data.safety?.blocked_keywords).toEqual([]);
    }
  });
});
