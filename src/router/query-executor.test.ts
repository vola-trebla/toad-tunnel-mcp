import { describe, it, expect, afterAll } from "vitest";
import { ConnectionManager } from "./connection-manager.js";
import { executeQuery, BlockedQueryError } from "./query-executor.js";
import { QueryValidator } from "../safety/query-validator.js";
import { type Config } from "../config/schema.js";

const config: Config = {
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
    stage: {
      host: "localhost",
      port: 5432,
      database: "sandbox_stage",
      user: "toad_reader",
      password: "toad_secret",
      permissions: "read-only",
      approval: "auto",
    },
  },
};

const validator = new QueryValidator({ max_rows: 3 });

describe("executeQuery with QueryValidator", () => {
  const manager = new ConnectionManager(config);

  afterAll(async () => {
    await manager.shutdown();
  });

  it("passes SELECT through to read-only env", async () => {
    const result = await executeQuery(
      manager,
      "stage",
      "SELECT 1 AS n",
      validator,
    );
    expect(result.rows[0]).toMatchObject({ n: 1 });
    expect(result.truncated).toBe(false);
  });

  it("blocks DELETE on read-only env before reaching DB", async () => {
    await expect(
      executeQuery(
        manager,
        "stage",
        "DELETE FROM products WHERE id = 999",
        validator,
      ),
    ).rejects.toThrow(BlockedQueryError);
  });

  it("allows DELETE on read-write env (blocklist skipped)", async () => {
    // This will fail at PG level because id 999999999 doesn't exist, but
    // it must NOT throw BlockedQueryError — validator allows read-write envs
    const result = await executeQuery(
      manager,
      "dev",
      "DELETE FROM products WHERE id = 999999999",
      validator,
    );
    expect(result.rowCount).toBe(0);
  });

  it("blocks keyword inside CTE on read-only env", async () => {
    await expect(
      executeQuery(
        manager,
        "stage",
        "WITH x AS (DELETE FROM products RETURNING *) SELECT * FROM x",
        validator,
      ),
    ).rejects.toThrow(BlockedQueryError);
  });

  it("truncates results when row count exceeds max_rows", async () => {
    // sandbox_stage has 800+ products, budget is 3
    const result = await executeQuery(
      manager,
      "stage",
      "SELECT id FROM products",
      validator,
    );
    expect(result.truncated).toBe(true);
    expect(result.rows.length).toBe(3);
    expect(result.rowCount).toBe(3);
  });

  it("does not truncate when result is within budget", async () => {
    const result = await executeQuery(
      manager,
      "stage",
      "SELECT 1 AS n UNION SELECT 2",
      validator,
    );
    expect(result.truncated).toBe(false);
    expect(result.rows.length).toBe(2);
  });

  it("no validator — no blocklist, no row budget", async () => {
    const result = await executeQuery(manager, "stage", "SELECT 1 AS n");
    expect(result.truncated).toBe(false);
    expect(result.rows[0]).toMatchObject({ n: 1 });
  });
});
