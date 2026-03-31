import type { TableOverview, ColumnInfo } from "./queries.js";

export function formatTablesAsTsv(tables: TableOverview[]): string {
  if (tables.length === 0) return "(no tables)";
  const lines = ["schema\ttable\testimated_rows"];
  for (const t of tables) {
    lines.push(`${t.schema}\t${t.table}\t${t.estimated_rows}`);
  }
  return lines.join("\n");
}

export function formatColumnsCompact(columns: ColumnInfo[]): string {
  // Format: name:type[:PK][:UNIQUE][:NOT NULL][:DEFAULT=val]
  return columns
    .map((c) => {
      const parts = [c.column, c.type];
      if (c.is_pk) parts.push("PK");
      else if (c.is_unique) parts.push("UNIQUE");
      if (!c.nullable) parts.push("NOT NULL");
      if (c.default_value && !c.is_pk) parts.push(`DEFAULT=${c.default_value}`);
      return parts.join(":");
    })
    .join(" | ");
}
