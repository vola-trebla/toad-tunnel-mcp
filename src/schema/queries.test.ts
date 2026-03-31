import { describe, it, expect, afterAll } from "vitest";
import { ConnectionManager } from "../router/connection-manager.js";
import { queryTables, queryColumns } from "./queries.js";
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
  },
};

describe("schema queries (integration)", () => {
  const manager = new ConnectionManager(config);

  afterAll(async () => {
    await manager.shutdown();
  });

  it("queryTables returns at least 3 tables", async () => {
    const pool = await manager.getPool("dev");
    const tables = await queryTables(pool);
    expect(tables.length).toBeGreaterThanOrEqual(3);
    expect(tables.every((t) => t.schema && t.table)).toBe(true);
  });

  it("queryTables includes products table", async () => {
    const pool = await manager.getPool("dev");
    const tables = await queryTables(pool);
    const found = tables.find(
      (t) => t.schema === "public" && t.table === "products",
    );
    expect(found).toBeDefined();
  });

  it("queryColumns returns columns for products table", async () => {
    const pool = await manager.getPool("dev");
    const cols = await queryColumns(pool, "public", "products");
    expect(cols.length).toBeGreaterThan(0);
    const names = cols.map((c) => c.column);
    expect(names).toContain("id");
    expect(names).toContain("title");
  });

  it("queryColumns marks id as PK", async () => {
    const pool = await manager.getPool("dev");
    const cols = await queryColumns(pool, "public", "products");
    const id = cols.find((c) => c.column === "id");
    expect(id?.is_pk).toBe(true);
  });

  it("queryColumns returns empty array for non-existent table", async () => {
    const pool = await manager.getPool("dev");
    const cols = await queryColumns(pool, "public", "nonexistent_table_xyz");
    expect(cols).toEqual([]);
  });
});
