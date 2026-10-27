/**
 * @jest-environment node
 *
 * src/tables.ts is the API's whitelist; the migrations are what D1 really
 * holds. They must agree column for column, and every filter the API accepts
 * must lead an index that ends with the table's time column.
 */
import { TABLES, retentionDays } from "../tables";
import { fakeD1, migrationSql } from "./testEnv";

const SQL_TYPE = { text: "TEXT", json: "TEXT", int: "INTEGER", bool: "INTEGER" } as const;

describe.each(Object.entries(TABLES))("%s", (table, spec) => {
  const db = fakeD1(migrationSql()).raw;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string; type: string; notnull: number; pk: number }>;

  it("has exactly the spec's columns, with matching types", () => {
    expect(columns.map((c) => c.name).sort()).toEqual(Object.keys(spec.columns).sort());
    for (const c of columns) expect(c.type).toBe(SQL_TYPE[spec.columns[c.name]]);
  });

  it("marks id the primary key and required columns NOT NULL", () => {
    expect(columns.find((c) => c.pk === 1)?.name).toBe("id");
    for (const name of ["created_at", spec.timeColumn, ...spec.required]) {
      expect({ name, notnull: columns.find((c) => c.name === name)?.notnull }).toEqual({ name, notnull: 1 });
    }
  });

  it("has an index led by every filter and by the time column, each ending with the time column", () => {
    const indexes = (db.prepare(`PRAGMA index_list(${table})`).all() as Array<{ name: string; origin: string }>)
      .filter((i) => i.origin === "c")
      .map((i) => (db.prepare(`PRAGMA index_info(${i.name})`).all() as Array<{ name: string }>).map((c) => c.name));
    for (const filter of [...spec.filters, ...(spec.erase?.by ?? []), spec.timeColumn]) {
      expect({ filter, led: indexes.some((cols) => cols[0] === filter) }).toEqual({ filter, led: true });
    }
    for (const cols of indexes) expect(cols[cols.length - 1]).toBe(spec.timeColumn);
  });

  it("only lets known columns be mutable, matched on, filtered and grouped", () => {
    const erase = spec.erase;
    const redacted = erase?.mode === "redact" ? Object.keys(erase.set) : [];
    for (const c of [...spec.mutable, ...spec.updateBy, ...spec.filters, ...spec.groupBy, ...spec.required, ...(erase?.by ?? []), ...redacted]) {
      expect(spec.columns).toHaveProperty(c);
    }
    expect(spec.columns[spec.timeColumn]).toBe("int");
  });
});

describe("retentionDays", () => {
  it("uses the override only when it is a sane number of days", () => {
    expect(retentionDays("whatsapp_log")).toBe(365);
    expect(retentionDays("whatsapp_log", '{"whatsapp_log": 180}')).toBe(180);
    expect(retentionDays("whatsapp_log", '{"whatsapp_log": 1}')).toBe(365);
    expect(retentionDays("whatsapp_log", "not json")).toBe(365);
    // Mongo's EmailLog TTL.
    expect(retentionDays("email_log")).toBe(90);
    expect(() => retentionDays("users")).toThrow("unknown table");
  });
});
