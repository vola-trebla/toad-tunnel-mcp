import * as fs from "node:fs";

export type AuditStatus = "success" | "blocked" | "rejected";

export interface AuditEntry {
  timestamp: string;
  env: string;
  database: string;
  sql: string;
  status: AuditStatus;
  duration_ms: number;
  row_count?: number;
  reason?: string;
}

export class AuditLogger {
  private readonly _write: (line: string) => void;

  /**
   * @param filePath - Append to this file. Omit to write to stderr.
   *   Note: stdout is reserved for the MCP stdio transport.
   * @param _writer - Override for testing (bypasses file/stderr).
   */
  constructor(filePath?: string, _writer?: (line: string) => void) {
    if (_writer) {
      this._write = _writer;
    } else if (filePath) {
      this._write = (line) => fs.appendFileSync(filePath, line + "\n", "utf8");
    } else {
      this._write = (line) => process.stderr.write(line + "\n");
    }
  }

  log(entry: AuditEntry): void {
    try {
      this._write(JSON.stringify(entry));
    } catch {
      // Logging must never crash the server
    }
  }
}
