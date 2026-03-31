/**
 * Tests for PostgreSQL read-only role enforcement (Phase 4 primary defence).
 * toad_reader role has default_transaction_read_only = ON at the DB level.
 */
import { describe, it, expect, afterAll } from "vitest";
import pg from "pg";

const { Pool } = pg;

const readerPool = new Pool({
  host: "localhost",
  port: 5432,
  database: "sandbox_stage",
  user: "toad_reader",
  password: "toad_secret",
});

const writerPool = new Pool({
  host: "localhost",
  port: 5432,
  database: "sandbox_dev",
  user: "toad",
  password: "toad_secret",
});

afterAll(async () => {
  await readerPool.end();
  await writerPool.end();
});

describe("PostgreSQL read-only role enforcement", () => {
  it("toad_reader can SELECT from stage", async () => {
    const result = await readerPool.query("SELECT COUNT(*) AS n FROM products");
    expect(Number(result.rows[0].n)).toBeGreaterThan(0);
  });

  it("toad_reader cannot INSERT — PG rejects at the wire level", async () => {
    await expect(
      readerPool.query(
        "INSERT INTO products(code, title, price, currency, source) VALUES('TEST-RO', 'test', 1.00, 'USD', 'test')",
      ),
    ).rejects.toThrow(/read.only/i);
  });

  it("toad_reader cannot UPDATE — PG rejects at the wire level", async () => {
    await expect(
      readerPool.query("UPDATE products SET status = 'inactive' WHERE id = 1"),
    ).rejects.toThrow(/read.only/i);
  });

  it("toad_reader cannot DELETE — PG rejects at the wire level", async () => {
    await expect(
      readerPool.query("DELETE FROM products WHERE id = 999999"),
    ).rejects.toThrow(/read.only/i);
  });

  it("toad_reader cannot DROP TABLE — PG rejects at the wire level", async () => {
    await expect(readerPool.query("DROP TABLE products")).rejects.toThrow(
      /read.only/i,
    );
  });

  it("toad (read-write) can INSERT and DELETE in dev", async () => {
    await writerPool.query(
      "INSERT INTO products(code, title, price, currency, source) VALUES('TEST-RW', 'rw test', 1.00, 'USD', 'test')",
    );
    const result = await writerPool.query(
      "SELECT id FROM products WHERE code = 'TEST-RW'",
    );
    expect(result.rows.length).toBe(1);
    await writerPool.query("DELETE FROM products WHERE code = 'TEST-RW'");
  });
});
