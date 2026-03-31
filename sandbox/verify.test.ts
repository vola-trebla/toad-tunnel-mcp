import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";

const { Pool } = pg;

const DATABASES = [
  "sandbox_dev",
  "sandbox_stage",
  "sandbox_prod",
  "sandbox_dev2",
] as const;
const TABLES = ["products", "categories", "data_checks"] as const;

const EXPECTED_MIN_ROWS: Record<string, Record<string, number>> = {
  sandbox_dev: { products: 80, categories: 15, data_checks: 100 },
  sandbox_stage: { products: 800, categories: 40, data_checks: 1000 },
  sandbox_prod: { products: 400, categories: 60, data_checks: 2000 },
  sandbox_dev2: { products: 40, categories: 8, data_checks: 60 },
};

function createPool(database: string) {
  return new Pool({
    host: "localhost",
    port: 5432,
    user: "toad",
    password: "toad_secret",
    database,
    max: 2,
  });
}

const pools = new Map<string, pg.Pool>();

function getPool(db: string): pg.Pool {
  if (!pools.has(db)) {
    pools.set(db, createPool(db));
  }
  return pools.get(db)!;
}

afterAll(async () => {
  for (const pool of pools.values()) {
    await pool.end();
  }
});

describe("Sandbox verification", () => {
  describe("connectivity", () => {
    for (const db of DATABASES) {
      it(`connects to ${db}`, async () => {
        const pool = getPool(db);
        const result = await pool.query("SELECT 1 AS ok");
        expect(result.rows[0].ok).toBe(1);
      });
    }
  });

  describe("schema", () => {
    for (const db of DATABASES) {
      for (const table of TABLES) {
        it(`${db} has table ${table} with correct columns`, async () => {
          const pool = getPool(db);
          const result = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_name = $1 ORDER BY ordinal_position`,
            [table],
          );
          const columns = result.rows.map((r) => r.column_name);
          expect(columns.length).toBeGreaterThan(0);

          // Verify key columns exist per table
          if (table === "products") {
            expect(columns).toContain("id");
            expect(columns).toContain("code");
            expect(columns).toContain("title");
            expect(columns).toContain("price");
          }
          if (table === "categories") {
            expect(columns).toContain("id");
            expect(columns).toContain("slug");
            expect(columns).toContain("name");
          }
          if (table === "data_checks") {
            expect(columns).toContain("id");
            expect(columns).toContain("code");
            expect(columns).toContain("severity");
            expect(columns).toContain("expected_value");
            expect(columns).toContain("actual_value");
          }
        });
      }
    }
  });

  describe("row counts", () => {
    for (const db of DATABASES) {
      for (const table of TABLES) {
        const minRows = EXPECTED_MIN_ROWS[db][table];
        it(`${db}.${table} has at least ${minRows} rows`, async () => {
          const pool = getPool(db);
          const result = await pool.query(
            `SELECT COUNT(*)::int AS cnt FROM ${table}`,
          );
          expect(result.rows[0].cnt).toBeGreaterThanOrEqual(minRows);
        });
      }
    }
  });

  describe("edge cases in sandbox_dev2", () => {
    it("has unicode SKUs", async () => {
      const pool = getPool("sandbox_dev2");
      const result = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM products WHERE code ~ '[^\\x00-\\x7F]'",
      );
      expect(result.rows[0].cnt).toBeGreaterThan(0);
    });

    it("has zero-price products", async () => {
      const pool = getPool("sandbox_dev2");
      const result = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM products WHERE price = 0",
      );
      expect(result.rows[0].cnt).toBeGreaterThan(0);
    });

    it("has NULL expected/actual values in data_checks", async () => {
      const pool = getPool("sandbox_dev2");
      const result = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM data_checks WHERE expected_value IS NULL OR actual_value IS NULL",
      );
      expect(result.rows[0].cnt).toBeGreaterThan(0);
    });

    it("has inactive categories", async () => {
      const pool = getPool("sandbox_dev2");
      const result = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM categories WHERE is_active = false",
      );
      expect(result.rows[0].cnt).toBeGreaterThan(0);
    });
  });
});
