import type pg from "pg";

export interface TableOverview {
  schema: string;
  table: string;
  estimated_rows: number;
}

export interface ColumnInfo {
  column: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  is_pk: boolean;
  is_unique: boolean;
}

export async function queryTables(pool: pg.Pool): Promise<TableOverview[]> {
  const sql = `
    SELECT
      n.nspname AS schema,
      c.relname AS table,
      GREATEST(c.reltuples::bigint, 0) AS estimated_rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r'
      AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    ORDER BY n.nspname, c.relname
  `;
  const result = await pool.query<TableOverview>(sql);
  return result.rows;
}

export async function queryColumns(
  pool: pg.Pool,
  schema: string,
  table: string,
): Promise<ColumnInfo[]> {
  const sql = `
    SELECT
      a.attname AS column,
      pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
      NOT a.attnotnull AS nullable,
      pg_get_expr(d.adbin, d.adrelid) AS default_value,
      EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_attribute ia ON ia.attrelid = i.indrelid AND ia.attnum = ANY(i.indkey)
        WHERE i.indrelid = a.attrelid AND i.indisprimary AND ia.attname = a.attname
      ) AS is_pk,
      EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_attribute ia ON ia.attrelid = i.indrelid AND ia.attnum = ANY(i.indkey)
        WHERE i.indrelid = a.attrelid AND i.indisunique AND NOT i.indisprimary AND ia.attname = a.attname
      ) AS is_unique
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname = $1
      AND c.relname = $2
      AND a.attnum > 0
      AND NOT a.attisdropped
    ORDER BY a.attnum
  `;
  const result = await pool.query<ColumnInfo>(sql, [schema, table]);
  return result.rows;
}
