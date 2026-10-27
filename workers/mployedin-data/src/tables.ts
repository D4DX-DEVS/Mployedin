/**
 * Every log table this Worker serves: which D1 database holds it, its columns
 * and their types, which columns a later write may update, which columns the
 * read API may filter or group by, and its retention.
 *
 * This list is the API's whitelist: a table, column or filter not named here is
 * refused before any SQL is built. It must match migrations/<db>/*.sql exactly
 * (__tests__/tables.test.ts applies the migrations and compares).
 */

export type ColumnType = "text" | "int" | "bool" | "json";
/** One D1 database (mployedin) holds every log table; the field stays so a table can move to its own database later. */
export type DbBinding = "DB_LOGS";

export interface TableSpec {
  db: DbBinding;
  columns: Record<string, ColumnType>;
  /** Required besides `id` and `created_at`. */
  required: string[];
  /** Updated when a row with the same id is written again (status changes). Empty: insert-once. */
  mutable: string[];
  /**
   * Besides id, the columns an `update` op may match rows on: a delivery receipt
   * carries the provider's message id, not ours.
   */
  updateBy: string[];
  /** Integer epoch-ms column the API sorts and ranges on, and retention ages by. */
  timeColumn: string;
  /** Columns the read API accepts as `?col=value` (each leads an index). */
  filters: string[];
  /** Columns the stats endpoint may count by. */
  groupBy: string[];
  /** Days a row stays in D1 before the nightly job archives it to R2. */
  retentionDays: number;
  /**
   * false: rows past retention are deleted without an R2 copy, as Mongo's TTL
   * deletes them (email_log). Default: archived to R2, then deleted.
   */
  archive?: false;
  /**
   * What POST /logs/erase may do (GDPR erasure, account cascades), mirroring the
   * app's Mongo code: delete the rows matched by one of `by`, or overwrite the
   * identifying columns in `set`. Absent: the table cannot be erased through the API.
   */
  erase?: { by: string[]; mode: "delete" } | { by: string[]; mode: "redact"; set: Record<string, string | null> };
}

const BASE = { id: "text", created_at: "int" } as const;

export const TABLES: Record<string, TableSpec> = {
  audit_log: {
    db: "DB_LOGS",
    columns: {
      ...BASE,
      actor_id: "text",
      actor_role: "text",
      on_behalf_of_id: "text",
      on_behalf_of_role: "text",
      action: "text",
      resource: "text",
      resource_id: "text",
      ip_address: "text",
      country: "text",
      user_agent: "text",
      changes: "json",
      meta: "json",
    },
    required: ["action", "resource"],
    mutable: [],
    updateBy: [],
    timeColumn: "created_at",
    filters: ["actor_id", "on_behalf_of_id", "action", "resource", "resource_id", "country"],
    groupBy: ["action", "resource", "actor_role", "country"],
    retentionDays: 2190,
  },
  consent_log: {
    db: "DB_LOGS",
    columns: {
      ...BASE,
      user_id: "text",
      user_name: "text",
      consent_type: "text",
      granted: "bool",
      source: "text",
      policy_version: "text",
      receipt_id: "text",
      ip_address: "text",
    },
    required: ["user_id", "consent_type", "granted"],
    mutable: [],
    updateBy: [],
    timeColumn: "created_at",
    filters: ["user_id", "consent_type", "receipt_id"],
    groupBy: ["consent_type", "granted", "source"],
    retentionDays: 2190,
    // lib/gdpr/erasure.ts anonymiseConsentLogs: the choice stays as evidence, the person does not.
    erase: { by: ["user_id"], mode: "redact", set: { user_name: "Deleted User", ip_address: null } },
  },
  email_log: {
    db: "DB_LOGS",
    columns: {
      ...BASE,
      sent_at: "int",
      user_id: "text",
      to_address: "text",
      subject: "text",
      category: "text",
      status: "text",
      message_id: "text",
      error_message: "text",
      source: "text",
      metadata: "json",
    },
    required: ["sent_at", "to_address", "category", "status", "source"],
    mutable: ["status", "message_id", "error_message"],
    updateBy: ["message_id"],
    timeColumn: "sent_at",
    filters: ["user_id", "status", "category", "source", "message_id"],
    groupBy: ["status", "category", "source"],
    // Mongo's EmailLog TTL is 90 days and GDPR erasure relies on it: D1 must not keep addresses longer, nor archive them.
    retentionDays: 90,
    archive: false,
  },
  whatsapp_log: {
    db: "DB_LOGS",
    columns: {
      ...BASE,
      sent_at: "int",
      status_at: "int",
      user_id: "text",
      to_number: "text",
      wa_message_id: "text",
      kind: "text",
      template_name: "text",
      template_language: "text",
      source: "text",
      category: "text",
      notification_type: "text",
      status: "text",
      error_code: "int",
      error_kind: "text",
      error_message: "text",
      skip_reason: "text",
      schedule_id: "text",
      broadcast_id: "text",
      conversation_category: "text",
    },
    required: ["sent_at", "to_number", "kind", "source", "category", "status"],
    mutable: ["status", "status_at", "wa_message_id", "error_code", "error_kind", "error_message", "conversation_category"],
    updateBy: ["wa_message_id"],
    timeColumn: "sent_at",
    filters: ["user_id", "status", "wa_message_id", "broadcast_id", "schedule_id", "source", "category"],
    groupBy: ["status", "category", "source", "kind"],
    retentionDays: 365,
    // lib/gdpr/erasure.ts eraseWhatsAppData: by account and by every number the person used.
    erase: { by: ["user_id", "to_number"], mode: "delete" },
  },
  activity_event: {
    db: "DB_LOGS",
    columns: { ...BASE, job_seeker_id: "text", type: "text", priority: "int", metadata: "json" },
    required: ["job_seeker_id", "type"],
    mutable: [],
    updateBy: [],
    timeColumn: "created_at",
    filters: ["job_seeker_id", "type"],
    groupBy: ["type"],
    retentionDays: 395,
  },
  profile_view: {
    db: "DB_LOGS",
    columns: {
      ...BASE,
      viewed_at: "int",
      job_seeker_id: "text",
      viewer_id: "text",
      viewer_role: "text",
      source: "text",
      notified_at: "int",
    },
    required: ["viewed_at", "job_seeker_id", "viewer_id", "viewer_role"],
    mutable: ["notified_at"],
    updateBy: [],
    timeColumn: "viewed_at",
    filters: ["job_seeker_id", "viewer_id"],
    groupBy: ["viewer_role", "source"],
    retentionDays: 395,
  },
  company_profile_view: {
    db: "DB_LOGS",
    columns: { ...BASE, viewed_at: "int", viewer_id: "text", employer_id: "text" },
    required: ["viewed_at", "viewer_id", "employer_id"],
    mutable: [],
    updateBy: [],
    timeColumn: "viewed_at",
    filters: ["employer_id", "viewer_id"],
    groupBy: [],
    retentionDays: 395,
    // lib/db/cascade.ts: an employer's deletion removes its page views.
    erase: { by: ["employer_id"], mode: "delete" },
  },
  resource_download: {
    db: "DB_LOGS",
    columns: {
      ...BASE,
      downloaded_at: "int",
      resource_id: "text",
      user_id: "text",
      file_key: "text",
      file_name: "text",
    },
    required: ["downloaded_at", "resource_id", "user_id", "file_key", "file_name"],
    mutable: [],
    updateBy: [],
    timeColumn: "downloaded_at",
    filters: ["resource_id", "user_id"],
    groupBy: [],
    retentionDays: 395,
  },
};

/** Rollup tables: rebuilt nightly from raw rows, never written through the API. */
export const ROLLUPS = {
  profile_view_daily: { db: "DB_LOGS" as DbBinding },
};

export function tableSpec(name: string): TableSpec | undefined {
  return Object.prototype.hasOwnProperty.call(TABLES, name) ? TABLES[name] : undefined;
}

/** Retention for a table, with the optional RETENTION_DAYS JSON override (minimum 30 days). */
export function retentionDays(table: string, override?: string): number {
  const spec = tableSpec(table);
  if (!spec) throw new Error(`unknown table ${table}`);
  if (override) {
    try {
      const days = (JSON.parse(override) as Record<string, unknown>)[table];
      if (typeof days === "number" && Number.isFinite(days) && days >= 30) return Math.floor(days);
    } catch {
      // malformed override: keep the default
    }
  }
  return spec.retentionDays;
}
