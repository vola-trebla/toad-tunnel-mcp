import { type ConnectionManager } from "./connection-manager.js";
import { type QueryValidator } from "../safety/query-validator.js";
import { ToadError } from "../utils/errors.js";

export class BlockedQueryError extends ToadError {
  constructor(reason: string) {
    super(reason);
    this.name = "BlockedQueryError";
  }
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
  totalFetched: number;
}

export async function executeQuery(
  connectionManager: ConnectionManager,
  env: string,
  sql: string,
  validator?: QueryValidator,
): Promise<QueryResult> {
  const pool = await connectionManager.getPool(env);

  // Apply row budget — only for SELECT statements
  const budgeted = validator ? validator.wrapWithBudget(sql) : null;
  const querySql = budgeted ? budgeted.sql : sql;
  const fetchLimit = budgeted ? budgeted.fetchLimit : Infinity;

  const result = await pool.query(querySql);
  const rows = result.rows;
  const truncated = isFinite(fetchLimit) && rows.length >= fetchLimit;

  return {
    rows: truncated ? rows.slice(0, fetchLimit - 1) : rows,
    rowCount: truncated ? fetchLimit - 1 : (result.rowCount ?? rows.length),
    truncated,
    totalFetched: rows.length,
  };
}
