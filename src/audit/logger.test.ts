import { describe, it, expect, vi, afterEach } from "vitest";
import { AuditLogger, type AuditEntry } from "./logger.js";

const baseEntry = (): AuditEntry => ({
  timestamp: "2024-01-01T00:00:00.000Z",
  env: "dev",
  database: "db",
  sql: "SELECT 1",
  status: "success",
  duration_ms: 10,
  row_count: 1,
});

describe("AuditLogger — stderr output (default)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON to stderr", () => {
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const logger = new AuditLogger();

    logger.log(baseEntry());

    expect(write).toHaveBeenCalledOnce();
    const written = write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed).toMatchObject({ env: "dev", status: "success" });
  });

  it("includes reason for blocked entries", () => {
    const write = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const logger = new AuditLogger();

    logger.log({
      ...baseEntry(),
      status: "blocked",
      reason: 'Blocked keyword "DROP"',
    });

    const written = write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.status).toBe("blocked");
    expect(parsed.reason).toMatch(/DROP/);
  });

  it("does not throw if stderr.write fails", () => {
    vi.spyOn(process.stderr, "write").mockImplementation(() => {
      throw new Error("write error");
    });
    const logger = new AuditLogger();
    expect(() => logger.log(baseEntry())).not.toThrow();
  });
});

describe("AuditLogger — file output", () => {
  it("calls custom writer with JSON line (file path injection point)", () => {
    const lines: string[] = [];
    // Pass a custom writer to simulate file output without touching the FS
    const logger = new AuditLogger(undefined, (line) => lines.push(line));
    logger.log(baseEntry());

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.env).toBe("dev");
    expect(parsed.status).toBe("success");
  });

  it("writes each entry as a separate line", () => {
    const lines: string[] = [];
    const logger = new AuditLogger(undefined, (line) => lines.push(line));

    logger.log(baseEntry());
    logger.log({ ...baseEntry(), status: "blocked", reason: "DROP" });

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).status).toBe("blocked");
  });
});
