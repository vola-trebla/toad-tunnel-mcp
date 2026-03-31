import { describe, it, expect } from "vitest";
import { QueryValidator, DEFAULT_BLOCKED_KEYWORDS } from "./query-validator.js";

describe("QueryValidator — keyword blocklist", () => {
  const validator = new QueryValidator({
    blocked_keywords: DEFAULT_BLOCKED_KEYWORDS,
    max_rows: 100,
  });

  it("passes a clean SELECT for read-only env", () => {
    expect(validator.validate("SELECT * FROM products", "read-only")).toEqual({
      ok: true,
    });
  });

  it("blocks DELETE on read-only env", () => {
    const result = validator.validate(
      "DELETE FROM products WHERE id = 1",
      "read-only",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/DELETE/);
  });

  it("blocks DROP TABLE", () => {
    const result = validator.validate("DROP TABLE products", "read-only");
    expect(result.ok).toBe(false);
  });

  it("blocks INSERT", () => {
    const result = validator.validate(
      "INSERT INTO products VALUES(1)",
      "read-only",
    );
    expect(result.ok).toBe(false);
  });

  it("blocks UPDATE", () => {
    const result = validator.validate(
      "UPDATE products SET status='x'",
      "read-only",
    );
    expect(result.ok).toBe(false);
  });

  it("blocks TRUNCATE", () => {
    expect(validator.validate("TRUNCATE products", "read-only").ok).toBe(false);
  });

  it("blocks keyword inside CTE — WITH x AS (DELETE ...)", () => {
    const result = validator.validate(
      "WITH x AS (DELETE FROM products RETURNING *) SELECT * FROM x",
      "read-only",
    );
    expect(result.ok).toBe(false);
    expect((result as { ok: false; reason: string }).reason).toMatch(/DELETE/);
  });

  it("blocks keyword inside block comment stripped — not tricked by /* DELETE */", () => {
    // Comment is stripped → keyword is gone → SELECT passes
    const result = validator.validate(
      "/* DELETE FROM products */ SELECT 1",
      "read-only",
    );
    expect(result.ok).toBe(true);
  });

  it("blocks keyword after line comment stripped", () => {
    // Comment is stripped → keyword is gone → passes
    const result = validator.validate(
      "-- DELETE FROM products\nSELECT 1",
      "read-only",
    );
    expect(result.ok).toBe(true);
  });

  it("does NOT block column name that contains a keyword as substring", () => {
    // CREATED_AT contains CREATE but should not match \\bCREATE\\b
    const result = validator.validate(
      "SELECT created_at FROM products",
      "read-only",
    );
    expect(result.ok).toBe(true);
  });

  it("skips blocklist for read-write env", () => {
    expect(
      validator.validate("DELETE FROM products WHERE id = 1", "read-write"),
    ).toEqual({ ok: true });
  });

  it("empty blocklist always passes", () => {
    const v = new QueryValidator({ blocked_keywords: [], max_rows: 100 });
    expect(v.validate("DROP TABLE products", "read-only")).toEqual({
      ok: true,
    });
  });
});

describe("QueryValidator — row budget", () => {
  const validator = new QueryValidator({ max_rows: 5 });

  it("wraps SELECT with LIMIT max+1", () => {
    const result = validator.wrapWithBudget("SELECT * FROM products");
    expect(result).not.toBeNull();
    expect(result!.fetchLimit).toBe(6);
    expect(result!.sql).toContain("LIMIT 6");
    expect(result!.sql).toContain("_toad_budget");
  });

  it("fetchLimit is always maxRows + 1", () => {
    const v = new QueryValidator({ max_rows: 100 });
    expect(v.wrapWithBudget("SELECT 1")!.fetchLimit).toBe(101);
  });

  it("returns null for non-SELECT statements", () => {
    expect(validator.wrapWithBudget("DELETE FROM products")).toBeNull();
    expect(
      validator.wrapWithBudget("INSERT INTO products VALUES(1)"),
    ).toBeNull();
    expect(validator.wrapWithBudget("UPDATE products SET x=1")).toBeNull();
  });
});
