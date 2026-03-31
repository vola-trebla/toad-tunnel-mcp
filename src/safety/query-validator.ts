export type ValidationResult = { ok: true } | { ok: false; reason: string };

export interface SafetyOptions {
  blocked_keywords: string[];
  max_rows: number;
  hitl_timeout_ms: number;
}

export const DEFAULT_BLOCKED_KEYWORDS = [
  "DROP",
  "DELETE",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
  "CREATE",
  "UPDATE",
  "INSERT",
];

export class QueryValidator {
  private readonly blockedUpper: string[];
  readonly maxRows: number;
  readonly hitlTimeoutMs: number;

  constructor(opts: Partial<SafetyOptions> = {}) {
    this.blockedUpper = (opts.blocked_keywords ?? DEFAULT_BLOCKED_KEYWORDS).map(
      (k) => k.toUpperCase(),
    );
    this.maxRows = opts.max_rows ?? 100;
    this.hitlTimeoutMs = opts.hitl_timeout_ms ?? 60_000;
  }

  /**
   * Validate SQL against the keyword blocklist.
   * Blocklist is only applied for read-only environments.
   * Returns { ok: false, reason } if a blocked keyword is found.
   */
  validate(
    sql: string,
    permissions: "read-only" | "read-write",
  ): ValidationResult {
    if (permissions === "read-write") return { ok: true };
    if (this.blockedUpper.length === 0) return { ok: true };

    const normalized = this._normalize(sql);

    for (const keyword of this.blockedUpper) {
      // Match keyword as a whole word so e.g. "CREATED_AT" doesn't match "CREATE"
      const pattern = new RegExp(`\\b${keyword}\\b`);
      if (pattern.test(normalized)) {
        return {
          ok: false,
          reason:
            `Blocked keyword "${keyword}" detected. ` +
            `This environment is read-only. ` +
            `Note: the blocklist is a fast-fail layer — ` +
            `the primary defence is the PostgreSQL read-only role.`,
        };
      }
    }

    return { ok: true };
  }

  /**
   * Wrap SQL in a subquery to enforce the row budget.
   * Only applied to SELECT statements — mutations return row counts, not result sets.
   * Fetch max+1 rows so we can detect truncation without a separate COUNT query.
   */
  wrapWithBudget(sql: string): { sql: string; fetchLimit: number } | null {
    const normalized = this._normalize(sql);
    if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH"))
      return null;

    const fetchLimit = this.maxRows + 1;
    return {
      sql: `SELECT * FROM (${sql}) AS _toad_budget LIMIT ${fetchLimit}`,
      fetchLimit,
    };
  }

  /**
   * Normalize SQL for keyword matching: strip comments, uppercase, collapse whitespace.
   *
   * Note: nested block comments (e.g. /‌* /‌* inner *‌/ outer *‌/) are not fully handled —
   * the lazy regex may leave trailing comment text as SQL. This errs on the side of
   * over-blocking (false positives), which is the safe default. The primary defence
   * is always the PostgreSQL read-only role, not this blocklist.
   */
  private _normalize(sql: string): string {
    return sql
      .replace(/--[^\n]*/g, " ") // strip line comments
      .replace(/\/\*[\s\S]*?\*\//g, " ") // strip block comments (non-nested)
      .toUpperCase()
      .replace(/\s+/g, " ")
      .trim();
  }
}
