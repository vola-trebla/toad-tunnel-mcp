/**
 * Integration tests: full safety pipeline
 *
 * Tests the complete request path from tool invocation through
 * HITL / blocklist / row-budget to the final response, using
 * in-process mocks (no real DB or SSH tunnel required).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { registerExecuteQuery } from "./execute-query.js";
import {
  QueryValidator,
  DEFAULT_BLOCKED_KEYWORDS,
} from "../safety/query-validator.js";
import { AuditLogger } from "../audit/logger.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

type Handler = (args: {
  env: string;
  sql: string;
}) => Promise<{ content: { type: string; text: string }[] }>;

function captureHandler(server: ReturnType<typeof makeServer>): Handler {
  return (server.registerTool as ReturnType<typeof vi.fn>).mock
    .calls[0][2] as Handler;
}

function makeServer(elicitResult?: {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}) {
  return {
    registerTool: vi.fn(),
    server: {
      elicitInput: vi
        .fn()
        .mockResolvedValue(
          elicitResult ?? { action: "accept", content: { confirmed: true } },
        ),
    },
  };
}

function makePool(rows: Record<string, unknown>[] = [], rowCount?: number) {
  return {
    query: vi.fn().mockResolvedValue({
      rows,
      rowCount: rowCount ?? rows.length,
    }),
  };
}

function makeManager(
  approval: "auto" | "hitl",
  permissions: "read-only" | "read-write",
  rows: Record<string, unknown>[] = [],
  rowCount?: number,
) {
  const pool = makePool(rows, rowCount);
  return {
    manager: {
      getEnvNames: () => ["prod", "dev"],
      getEnvConfig: vi.fn().mockReturnValue({
        host: "localhost",
        port: 5432,
        database: approval === "hitl" ? "prod_db" : "dev_db",
        user: "u",
        password: "p",
        permissions,
        approval,
      }),
      getPool: vi.fn().mockResolvedValue(pool),
    },
    pool,
  };
}

function makeValidatorReadOnly(maxRows = 100) {
  return new QueryValidator({
    blocked_keywords: DEFAULT_BLOCKED_KEYWORDS,
    max_rows: maxRows,
    hitl_timeout_ms: 5_000,
  });
}

function makeValidatorReadWrite(maxRows = 100) {
  return new QueryValidator({
    blocked_keywords: [],
    max_rows: maxRows,
    hitl_timeout_ms: 5_000,
  });
}

// ---------------------------------------------------------------------------
// Pipeline tests
// ---------------------------------------------------------------------------

describe("Safety pipeline — dev env (no blocklist, no HITL)", () => {
  it("executes SELECT directly and returns rows", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const { manager } = makeManager("auto", "read-write", rows);
    const server = makeServer();
    const validator = makeValidatorReadWrite();

    registerExecuteQuery(server as never, manager as never, validator);
    const handler = captureHandler(server);

    const result = await handler({ env: "dev", sql: "SELECT * FROM products" });
    expect(server.server.elicitInput).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain('{"id":1}');
  });

  it("returns (no rows) for empty result", async () => {
    const { manager } = makeManager("auto", "read-write", []);
    const server = makeServer();

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadWrite(),
    );
    const result = await captureHandler(server)({
      env: "dev",
      sql: "SELECT 1 WHERE false",
    });
    expect(result.content[0].text).toBe("(no rows)");
  });
});

describe("Safety pipeline — prod env, read-only, no HITL (approval: auto)", () => {
  it("blocks DELETE before reaching the DB", async () => {
    const { manager, pool } = makeManager("auto", "read-only");
    const server = makeServer();
    const validator = makeValidatorReadOnly();

    registerExecuteQuery(server as never, manager as never, validator);
    const result = await captureHandler(server)({
      env: "prod",
      sql: "DELETE FROM products WHERE id = 1",
    });

    expect(pool.query).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Blocked keyword");
    expect(result.content[0].text).toContain("DELETE");
  });

  it("blocks DROP TABLE before reaching the DB", async () => {
    const { manager, pool } = makeManager("auto", "read-only");
    const server = makeServer();

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
    );
    const result = await captureHandler(server)({
      env: "prod",
      sql: "DROP TABLE products",
    });

    expect(pool.query).not.toHaveBeenCalled();
    expect(result.content[0].text).toMatch(/Blocked keyword.*DROP/);
  });

  it("passes clean SELECT through to DB", async () => {
    const rows = [{ name: "widget" }];
    const { manager } = makeManager("auto", "read-only", rows);
    const server = makeServer();

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
    );
    const result = await captureHandler(server)({
      env: "prod",
      sql: "SELECT name FROM products",
    });

    expect(result.content[0].text).toContain("widget");
  });
});

describe("Safety pipeline — prod env, HITL required", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("SELECT → HITL approved → query executed → rows returned", async () => {
    const rows = [{ id: 42 }];
    const { manager } = makeManager("hitl", "read-only", rows);
    const server = makeServer({
      action: "accept",
      content: { confirmed: true },
    });

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
    );
    const result = await captureHandler(server)({
      env: "prod",
      sql: "SELECT id FROM products",
    });

    expect(server.server.elicitInput).toHaveBeenCalledOnce();
    expect(result.content[0].text).toContain('{"id":42}');
  });

  it("SELECT → HITL rejected → query not executed", async () => {
    const { manager, pool } = makeManager("hitl", "read-only");
    const server = makeServer({ action: "decline" });

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
    );
    const result = await captureHandler(server)({
      env: "prod",
      sql: "SELECT id FROM products",
    });

    expect(pool.query).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("declined");
  });

  it("SELECT → HITL cancelled → query not executed", async () => {
    const { manager, pool } = makeManager("hitl", "read-only");
    const server = makeServer({ action: "cancel" });

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
    );
    const result = await captureHandler(server)({
      env: "prod",
      sql: "SELECT 1",
    });

    expect(pool.query).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("cancelled");
  });

  it("DELETE in HITL env is blocked before elicitation is shown", async () => {
    const { manager, pool } = makeManager("hitl", "read-only");
    const server = makeServer({
      action: "accept",
      content: { confirmed: true },
    });

    // Blocklist runs BEFORE HITL — no point asking the user to approve
    // a query that will be rejected anyway.
    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
    );
    const result = await captureHandler(server)({
      env: "prod",
      sql: "DELETE FROM products WHERE id = 1",
    });

    // Blocklist catches DELETE before HITL fires
    expect(server.server.elicitInput).not.toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("Blocked keyword");
  });
});

describe("Safety pipeline — row budget", () => {
  it("truncates large result set and appends summary", async () => {
    const maxRows = 5;
    // Return maxRows+1 rows to simulate a larger result set
    const rows = Array.from({ length: maxRows + 1 }, (_, i) => ({ id: i }));
    const { manager } = makeManager("auto", "read-write", rows);
    const server = makeServer();
    const validator = makeValidatorReadWrite(maxRows);

    registerExecuteQuery(server as never, manager as never, validator);
    const result = await captureHandler(server)({
      env: "dev",
      sql: "SELECT id FROM big_table",
    });

    const text = result.content[0].text;
    expect(text).toContain("rows — showing first");
    // Verify exactly maxRows data lines before the summary
    const dataLines = text.split("\n").filter((l) => l.startsWith("{"));
    expect(dataLines).toHaveLength(maxRows);
  });

  it("does not truncate when result fits within budget", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const { manager } = makeManager("auto", "read-write", rows);
    const server = makeServer();
    const validator = makeValidatorReadWrite(100);

    registerExecuteQuery(server as never, manager as never, validator);
    const result = await captureHandler(server)({
      env: "dev",
      sql: "SELECT id FROM small_table LIMIT 2",
    });

    expect(result.content[0].text).not.toContain("rows — showing first");
    expect(result.content[0].text).toContain('{"id":1}');
  });
});

describe("Safety pipeline — concurrent queries", () => {
  it("safety checks are independent across envs", async () => {
    // dev: auto + read-write → passes through
    const devRows = [{ id: "dev" }];
    const { manager: devManager } = makeManager("auto", "read-write", devRows);

    // prod: auto + read-only + blocklist → blocks DELETE
    const { manager: prodManager } = makeManager("auto", "read-only");

    const devServer = makeServer();
    const prodServer = makeServer();

    registerExecuteQuery(
      devServer as never,
      devManager as never,
      makeValidatorReadWrite(),
    );
    registerExecuteQuery(
      prodServer as never,
      prodManager as never,
      makeValidatorReadOnly(),
    );

    const devHandler = captureHandler(devServer);
    const prodHandler = captureHandler(prodServer);

    const [devResult, prodResult] = await Promise.all([
      devHandler({ env: "dev", sql: "SELECT id FROM t" }),
      prodHandler({ env: "prod", sql: "DELETE FROM t" }),
    ]);

    expect(devResult.content[0].text).toContain("dev");
    expect(prodResult.content[0].text).toContain("Blocked keyword");
  });
});

describe("Safety pipeline — audit log", () => {
  it("logs status:blocked for blocked queries", async () => {
    const { manager } = makeManager("auto", "read-only");
    const server = makeServer();
    const validator = makeValidatorReadOnly();
    const logged: unknown[] = [];
    const auditLogger = new AuditLogger();
    vi.spyOn(process.stderr, "write").mockImplementation((line) => {
      logged.push(JSON.parse((line as string).trim()));
      return true;
    });

    registerExecuteQuery(
      server as never,
      manager as never,
      validator,
      auditLogger,
    );
    await captureHandler(server)({ env: "prod", sql: "DELETE FROM t" });

    const entry = logged[0] as Record<string, unknown>;
    expect(entry.status).toBe("blocked");
    expect(entry.env).toBe("prod");

    vi.restoreAllMocks();
  });

  it("logs status:rejected for HITL-declined queries", async () => {
    const { manager } = makeManager("hitl", "read-only");
    const server = makeServer({ action: "decline" });
    const logged: unknown[] = [];
    const auditLogger = new AuditLogger();
    vi.spyOn(process.stderr, "write").mockImplementation((line) => {
      logged.push(JSON.parse((line as string).trim()));
      return true;
    });

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadOnly(),
      auditLogger,
    );
    await captureHandler(server)({ env: "prod", sql: "SELECT 1" });

    const entry = logged[0] as Record<string, unknown>;
    expect(entry.status).toBe("rejected");
    expect(entry.reason).toContain("declined");

    vi.restoreAllMocks();
  });

  it("logs status:success for successful queries", async () => {
    const { manager } = makeManager("auto", "read-write", [{ id: 1 }]);
    const server = makeServer();
    const logged: unknown[] = [];
    const auditLogger = new AuditLogger();
    vi.spyOn(process.stderr, "write").mockImplementation((line) => {
      logged.push(JSON.parse((line as string).trim()));
      return true;
    });

    registerExecuteQuery(
      server as never,
      manager as never,
      makeValidatorReadWrite(),
      auditLogger,
    );
    await captureHandler(server)({ env: "dev", sql: "SELECT 1" });

    const entry = logged[0] as Record<string, unknown>;
    expect(entry.status).toBe("success");
    expect(typeof entry.duration_ms).toBe("number");

    vi.restoreAllMocks();
  });
});
