import { describe, it, expect } from "vitest";
import { formatTablesAsTsv, formatColumnsCompact } from "./formatter.js";
import type { TableOverview, ColumnInfo } from "./queries.js";

describe("formatTablesAsTsv", () => {
  it("returns header + rows", () => {
    const tables: TableOverview[] = [
      { schema: "public", table: "users", estimated_rows: 100 },
      { schema: "public", table: "orders", estimated_rows: 500 },
    ];
    const result = formatTablesAsTsv(tables);
    expect(result).toBe(
      "schema\ttable\testimated_rows\npublic\tusers\t100\npublic\torders\t500",
    );
  });

  it("returns placeholder for empty array", () => {
    expect(formatTablesAsTsv([])).toBe("(no tables)");
  });
});

describe("formatColumnsCompact", () => {
  it("formats PK column", () => {
    const cols: ColumnInfo[] = [
      {
        column: "id",
        type: "integer",
        nullable: false,
        default_value: "nextval('users_id_seq')",
        is_pk: true,
        is_unique: false,
      },
    ];
    expect(formatColumnsCompact(cols)).toBe("id:integer:PK:NOT NULL");
  });

  it("formats UNIQUE column", () => {
    const cols: ColumnInfo[] = [
      {
        column: "email",
        type: "character varying(255)",
        nullable: false,
        default_value: null,
        is_pk: false,
        is_unique: true,
      },
    ];
    expect(formatColumnsCompact(cols)).toBe(
      "email:character varying(255):UNIQUE:NOT NULL",
    );
  });

  it("formats nullable column with default", () => {
    const cols: ColumnInfo[] = [
      {
        column: "status",
        type: "text",
        nullable: true,
        default_value: "'active'",
        is_pk: false,
        is_unique: false,
      },
    ];
    expect(formatColumnsCompact(cols)).toBe("status:text:DEFAULT='active'");
  });

  it("formats multiple columns separated by pipe", () => {
    const cols: ColumnInfo[] = [
      {
        column: "id",
        type: "integer",
        nullable: false,
        default_value: null,
        is_pk: true,
        is_unique: false,
      },
      {
        column: "name",
        type: "text",
        nullable: false,
        default_value: null,
        is_pk: false,
        is_unique: false,
      },
    ];
    expect(formatColumnsCompact(cols)).toBe(
      "id:integer:PK:NOT NULL | name:text:NOT NULL",
    );
  });
});
