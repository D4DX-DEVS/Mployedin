/**
 * Test doubles for the Worker bindings. D1 is real SQLite (node:sqlite, the same
 * engine D1 runs) with the real migrations applied, so the SQL the Worker builds
 * is executed, not mocked. Vectorize and R2 record their calls.
 */
import { readFileSync, readdirSync } from "fs";
import path from "path";

/** The slice of node:sqlite used here (the repo's @types/node predates its typings). */
interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): { changes: number | bigint };
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}
// node:sqlite is loaded with require: jest's resolver cannot import prefix-only built-ins.
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: new (path: string) => SqliteDatabase };
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  Env,
  VectorizeIndex,
  VectorizeQueryOptions,
  VectorizeVector,
} from "../types";

type SqlParam = string | number | null;

const MIGRATIONS = path.join(__dirname, "..", "..", "migrations");

/** Every migration of the mployedin D1 database, in order (what wrangler applies). */
export function migrationSql(): string {
  const dir = path.join(MIGRATIONS, "logs");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
}

export interface FakeD1 extends D1Database {
  raw: InstanceType<typeof DatabaseSync>;
  /** Every statement executed, in order (batch statements included). */
  executed: string[];
}

export function fakeD1(sql: string): FakeD1 {
  const raw = new DatabaseSync(":memory:");
  raw.exec(sql);
  const executed: string[] = [];

  const exec = (query: string, params: SqlParam[]): D1Result => {
    executed.push(query);
    const stmt = raw.prepare(query);
    if (/^\s*SELECT/i.test(query)) {
      return { results: stmt.all(...params) as Record<string, unknown>[], success: true, meta: {} };
    }
    const info = stmt.run(...params);
    return { results: [], success: true, meta: { changes: Number(info.changes) } };
  };

  class Statement implements D1PreparedStatement {
    constructor(readonly query: string, readonly params: SqlParam[] = []) {}
    bind(...values: unknown[]): D1PreparedStatement {
      if (values.length > 100) throw new Error("D1: too many SQL variables (limit 100)");
      for (const v of values) if (v === undefined) throw new Error("D1_TYPE_ERROR: undefined is not a supported type");
      return new Statement(this.query, values as SqlParam[]);
    }
    async first<T>(): Promise<T | null> {
      return (exec(this.query, this.params).results[0] as T) ?? null;
    }
    async all<T>(): Promise<D1Result<T>> {
      return exec(this.query, this.params) as D1Result<T>;
    }
    async run(): Promise<D1Result> {
      return exec(this.query, this.params);
    }
  }

  return {
    raw,
    executed,
    prepare: (query: string) => new Statement(query),
    async batch(statements: D1PreparedStatement[]) {
      // D1 runs a batch as one transaction: all statements apply or none.
      raw.exec("BEGIN");
      try {
        const results = statements.map((s) => exec((s as Statement).query, (s as Statement).params));
        raw.exec("COMMIT");
        return results;
      } catch (err) {
        raw.exec("ROLLBACK");
        throw err;
      }
    },
  };
}

export interface FakeIndex extends VectorizeIndex {
  upserted: VectorizeVector[];
  queries: Array<{ vector?: number[]; id?: string; options?: VectorizeQueryOptions }>;
  deleted: string[];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * A Vectorize stand-in. With canned `matches` every query returns them;
 * without, it is a real in-memory index: upsert replaces by id, delete removes,
 * and queries rank stored vectors by cosine, best first, topK of them.
 */
export function fakeIndex(matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }> = []): FakeIndex {
  const stored = new Map<string, VectorizeVector>();
  const rank = (vector: number[], options?: VectorizeQueryOptions) => {
    if (matches.length) return { count: matches.length, matches };
    const ranked = [...stored.values()]
      .map((v) => ({ id: v.id, score: cosine(vector, v.values as number[]) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, options?.topK ?? 5);
    return { count: ranked.length, matches: ranked };
  };
  const index: FakeIndex = {
    upserted: [],
    queries: [],
    deleted: [],
    async upsert(vectors) {
      index.upserted.push(...vectors);
      for (const v of vectors) stored.set(v.id, v);
      return { mutationId: "m1" };
    },
    async query(vector, options) {
      index.queries.push({ vector, options });
      return rank(vector, options);
    },
    async queryById(id, options) {
      index.queries.push({ id, options });
      const self = stored.get(id);
      return self ? rank(self.values as number[], options) : matches.length ? { count: matches.length, matches } : { count: 0, matches: [] };
    },
    async deleteByIds(ids) {
      index.deleted.push(...ids);
      for (const id of ids) stored.delete(id);
      return { mutationId: "m2" };
    },
  };
  return index;
}

export interface TestEnv extends Env {
  DB_LOGS: FakeD1;
  VEC_JOBS: FakeIndex;
  VEC_SEEKERS: FakeIndex;
  VEC_SEARCH: FakeIndex;
  archived: Array<{ key: string; body: Uint8Array; contentType?: string; contentEncoding?: string }>;
}

export const TEST_SECRET = "s".repeat(40);

export function testEnv(): TestEnv {
  const archived: TestEnv["archived"] = [];
  return {
    DB_LOGS: fakeD1(migrationSql()),
    VEC_JOBS: fakeIndex([{ id: "65f0c0ffee0000000000aaaa", score: 0.91 }]),
    VEC_SEEKERS: fakeIndex(),
    VEC_SEARCH: fakeIndex(),
    ARCHIVE: {
      async put(key, value, options) {
        const body = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value as ArrayBuffer);
        archived.push({ key, body, ...options?.httpMetadata });
        return {};
      },
    },
    archived,
    DATA_WORKER_SECRET: TEST_SECRET,
  };
}
