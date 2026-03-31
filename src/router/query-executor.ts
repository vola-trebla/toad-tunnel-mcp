import { type ConnectionManager } from "./connection-manager.js";

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
}

export async function executeQuery(
  connectionManager: ConnectionManager,
  env: string,
  sql: string,
): Promise<QueryResult> {
  const pool = await connectionManager.getPool(env);
  const result = await pool.query(sql);
  return {
    rows: result.rows,
    rowCount: result.rowCount ?? result.rows.length,
  };
}
