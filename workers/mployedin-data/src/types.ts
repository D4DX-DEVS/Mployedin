/**
 * The slice of the Workers runtime API this Worker uses, declared here so it
 * compiles and unit-tests without @cloudflare/workers-types (the shapes follow
 * https://developers.cloudflare.com/d1/worker-api/ and /vectorize/reference/client-api/).
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; rows_read?: number; rows_written?: number; duration?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /** Runs the statements in one implicit transaction: all apply or none. */
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export interface VectorizeVector {
  id: string;
  values: number[];
  namespace?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface VectorizeMatch {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface VectorizeQueryOptions {
  topK?: number;
  namespace?: string;
  returnValues?: boolean;
  returnMetadata?: "none" | "indexed" | "all";
  filter?: Record<string, unknown>;
}

export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<{ mutationId: string }>;
  query(vector: number[], options?: VectorizeQueryOptions): Promise<{ count: number; matches: VectorizeMatch[] }>;
  queryById(id: string, options?: VectorizeQueryOptions): Promise<{ count: number; matches: VectorizeMatch[] }>;
  deleteByIds(ids: string[]): Promise<{ mutationId: string }>;
}

export interface R2Bucket {
  put(key: string, value: ArrayBuffer | Uint8Array | string, options?: { httpMetadata?: { contentType?: string; contentEncoding?: string } }): Promise<unknown>;
}

export interface ScheduledController {
  scheduledTime: number;
  cron: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env {
  /** The mployedin D1 database: every log table (src/tables.ts) + rollups. */
  DB_LOGS: D1Database;
  VEC_JOBS: VectorizeIndex;
  VEC_SEEKERS: VectorizeIndex;
  VEC_SEARCH: VectorizeIndex;
  /** The PRIVATE R2 bucket; archived log rows go under log-archive/. */
  ARCHIVE: R2Bucket;
  /** Shared with the app (DATA_WORKER_SECRET there). `wrangler secret put DATA_WORKER_SECRET`. */
  DATA_WORKER_SECRET: string;
  /** Optional per-table retention override, JSON: {"email_log": 180}. Days. */
  RETENTION_DAYS?: string;
}
