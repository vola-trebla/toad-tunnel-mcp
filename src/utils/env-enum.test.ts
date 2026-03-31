import { describe, it, expect } from "vitest";
import { envEnum } from "./env-enum.js";

describe("envEnum", () => {
  it("creates a valid Zod enum from env names", () => {
    const schema = envEnum(["dev", "staging", "prod"]);
    expect(schema.safeParse("dev").success).toBe(true);
    expect(schema.safeParse("staging").success).toBe(true);
    expect(schema.safeParse("unknown").success).toBe(false);
  });

  it("throws on empty array", () => {
    expect(() => envEnum([])).toThrow("At least one environment");
  });

  it("works with single environment", () => {
    const schema = envEnum(["dev"]);
    expect(schema.safeParse("dev").success).toBe(true);
    expect(schema.safeParse("prod").success).toBe(false);
  });
});
