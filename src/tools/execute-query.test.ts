import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerExecuteQuery } from "./execute-query.js";
import { QueryValidator } from "../safety/query-validator.js";

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

function makeValidator(
  opts: { hitl_timeout_ms?: number } = {},
): QueryValidator {
  return new QueryValidator({
    blocked_keywords: [],
    max_rows: 100,
    hitl_timeout_ms: opts.hitl_timeout_ms ?? 5_000,
  });
}

function makeEnvConfig(
  approval: "auto" | "hitl",
  permissions: "read-only" | "read-write" = "read-write",
) {
  return {
    host: "localhost",
    port: 5432,
    database: "db",
    user: "user",
    password: "pass",
    permissions,
    approval,
  };
}

function makePool(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  };
}

function makeConnectionManager(
  approval: "auto" | "hitl" = "auto",
  rows: Record<string, unknown>[] = [],
) {
  const pool = makePool(rows);
  return {
    getEnvNames: () => ["test"],
    getEnvConfig: vi.fn().mockReturnValue(makeEnvConfig(approval)),
    getPool: vi.fn().mockResolvedValue(pool),
  };
}

type ToolHandler = (args: { env: string; sql: string }) => Promise<unknown>;

/** Capture the registered handler from server.registerTool */
function captureHandler(server: ReturnType<typeof makeMcpServer>): ToolHandler {
  const calls = (server.registerTool as ReturnType<typeof vi.fn>).mock.calls;
  if (calls.length === 0) throw new Error("registerTool not called");
  return calls[0][2] as ToolHandler;
}

function makeMcpServer(elicitResult?: {
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

// ---------------------------------------------------------------------------
// Tests — auto-approval (no elicitation)
// ---------------------------------------------------------------------------

describe("execute-query tool — auto approval", () => {
  it("returns rows when query succeeds", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const manager = makeConnectionManager("auto", rows);
    const server = makeMcpServer();
    const validator = makeValidator();

    registerExecuteQuery(server as never, manager as never, validator);
    const handler = captureHandler(server);

    const result = await handler({ env: "test", sql: "SELECT * FROM t" });
    expect(result).toMatchObject({
      content: [{ type: "text", text: '{"id":1}\n{"id":2}' }],
    });
    expect(server.server.elicitInput).not.toHaveBeenCalled();
  });

  it('returns "(no rows)" for empty result', async () => {
    const manager = makeConnectionManager("auto", []);
    const server = makeMcpServer();

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server);

    const result = await handler({ env: "test", sql: "SELECT 1" });
    expect(result).toMatchObject({
      content: [{ type: "text", text: "(no rows)" }],
    });
  });
});

// ---------------------------------------------------------------------------
// Tests — HITL approval
// ---------------------------------------------------------------------------

describe("execute-query tool — HITL approval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("proceeds when user accepts and checks confirmed", async () => {
    const rows = [{ id: 42 }];
    const manager = makeConnectionManager("hitl", rows);
    const server = makeMcpServer({
      action: "accept",
      content: { confirmed: true },
    });

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server);

    const result = await handler({ env: "test", sql: "SELECT 42" });
    expect(server.server.elicitInput).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      content: [{ type: "text", text: '{"id":42}' }],
    });
  });

  it("rejects when user declines", async () => {
    const manager = makeConnectionManager("hitl");
    const server = makeMcpServer({ action: "decline" });

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server);

    const result = await handler({ env: "test", sql: "SELECT 1" });
    expect(result).toMatchObject({
      content: [{ type: "text", text: expect.stringContaining("declined") }],
    });
    expect(manager.getPool).not.toHaveBeenCalled();
  });

  it("rejects when user cancels", async () => {
    const manager = makeConnectionManager("hitl");
    const server = makeMcpServer({ action: "cancel" });

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server);

    const result = await handler({ env: "test", sql: "SELECT 1" });
    expect(result).toMatchObject({
      content: [{ type: "text", text: expect.stringContaining("cancelled") }],
    });
    expect(manager.getPool).not.toHaveBeenCalled();
  });

  it("rejects when accepted but confirmed is false", async () => {
    const manager = makeConnectionManager("hitl");
    const server = makeMcpServer({
      action: "accept",
      content: { confirmed: false },
    });

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server);

    const result = await handler({ env: "test", sql: "SELECT 1" });
    expect(result).toMatchObject({
      content: [{ type: "text", text: expect.stringContaining("not checked") }],
    });
    expect(manager.getPool).not.toHaveBeenCalled();
  });

  it("rejects on timeout", async () => {
    const manager = makeConnectionManager("hitl");
    // elicitInput never resolves
    const server = {
      registerTool: vi.fn(),
      server: {
        elicitInput: vi.fn().mockImplementation(
          () => new Promise(() => {}), // hang forever
        ),
      },
    };

    const validator = makeValidator({ hitl_timeout_ms: 1_000 });
    registerExecuteQuery(server as never, manager as never, validator);
    const handler = captureHandler(server as ReturnType<typeof makeMcpServer>);

    const resultPromise = handler({ env: "test", sql: "SELECT 1" });
    // Advance fake timers to trigger the timeout
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result).toMatchObject({
      content: [{ type: "text", text: expect.stringContaining("timed out") }],
    });
    expect(manager.getPool).not.toHaveBeenCalled();
  });

  it("rejects gracefully when elicitInput throws (client unsupported)", async () => {
    const manager = makeConnectionManager("hitl");
    const server = {
      registerTool: vi.fn(),
      server: {
        elicitInput: vi.fn().mockRejectedValue(new Error("Method not found")),
      },
    };

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server as ReturnType<typeof makeMcpServer>);

    const result = await handler({ env: "test", sql: "SELECT 1" });
    expect(result).toMatchObject({
      content: [
        {
          type: "text",
          text: expect.stringContaining("elicitation failed"),
        },
      ],
    });
    expect(manager.getPool).not.toHaveBeenCalled();
  });

  it("includes SQL preview in the elicitation message", async () => {
    const manager = makeConnectionManager("hitl", []);
    const server = makeMcpServer({
      action: "accept",
      content: { confirmed: true },
    });

    registerExecuteQuery(server as never, manager as never, makeValidator());
    const handler = captureHandler(server);

    await handler({ env: "test", sql: "SELECT * FROM products" });

    const call = (server.server.elicitInput as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(call.message).toContain("SELECT * FROM products");
  });
});
