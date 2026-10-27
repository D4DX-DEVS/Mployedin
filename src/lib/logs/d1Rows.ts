/**
 * Mongo log document -> D1 row, for every log collection that moves to D1
 * (docs/CLOUDFLARE-STORAGE-MIGRATION-PLAN.md part 2). The live mirror
 * (lib/logs/logStore.ts) and the backfill (scripts/backfill-logs-to-d1.ts) both
 * use these, so a row copied later is identical to one mirrored at write time.
 *
 * The D1 id is the Mongo _id (24 hex), so writing the same document twice is a
 * no-op (ON CONFLICT(id)) and the two stores can be compared row for row.
 * Columns and types must match workers/mployedin-data/src/tables.ts
 * (__tests__/lib/logs/d1Rows.test.ts checks them against the Worker's spec).
 *
 * A document missing a value the D1 table requires maps to null: the caller
 * skips it rather than have the Worker refuse the whole batch.
 */
import type { LogTable } from "@/lib/cloudflare/dataWorkerClient";

export type D1Row = Record<string, string | number | boolean | Record<string, unknown> | unknown[] | undefined>;

/** The Worker refuses text and JSON over 64 KB; stay under it. */
const MAX_TEXT = 60_000;

type Doc = Record<string, unknown>;

/** An ObjectId (or string id) as its hex string; undefined when absent. */
export function idString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = typeof value === "string" ? value : String(value);
  return text && text !== "[object Object]" ? text : undefined;
}

/** A Date (or ISO string / epoch number) as epoch milliseconds; undefined when absent or invalid. */
export function epochMs(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(String(value));
  return Number.isSafeInteger(ms) ? ms : undefined;
}

function text(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const s = typeof value === "string" ? value : String(value);
  return s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s;
}

function int(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

/** Plain JSON, or a marker when it would be over the Worker's limit (the row still lands). */
function json(value: unknown): Record<string, unknown> | unknown[] | undefined {
  if (value === null || value === undefined) return undefined;
  let serialised: string | undefined;
  try {
    serialised = JSON.stringify(value);
  } catch {
    return { unserialisable: true };
  }
  if (serialised === undefined) return undefined;
  if (serialised.length > MAX_TEXT) return { truncated: true, bytes: serialised.length };
  return JSON.parse(serialised) as Record<string, unknown> | unknown[];
}

/** Drops undefined values; null when any required column is missing. */
function finish(row: D1Row, required: string[]): D1Row | null {
  for (const column of ["id", "created_at", ...required]) {
    if (row[column] === undefined || row[column] === "") return null;
  }
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
}

/** A hydrated Mongoose document or a lean object, as a plain object. */
function plain(doc: unknown): Doc {
  const maybe = doc as { toObject?: (opts?: Record<string, unknown>) => Doc };
  return typeof maybe?.toObject === "function" ? maybe.toObject({ depopulate: true }) : (doc as Doc);
}

const MAPPERS: Record<LogTable, (d: Doc) => D1Row | null> = {
  audit_log: (d) =>
    finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt),
        actor_id: idString(d.actorId),
        actor_role: text(d.actorRole),
        on_behalf_of_id: idString(d.onBehalfOfId),
        on_behalf_of_role: text(d.onBehalfOfRole),
        action: text(d.action),
        resource: text(d.resource),
        resource_id: text(d.resourceId),
        ip_address: text(d.ipAddress),
        country: text(d.country),
        user_agent: text(d.userAgent),
        changes: json(d.changes),
        meta: json(d.meta),
      },
      ["action", "resource"],
    ),
  consent_log: (d) =>
    finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt),
        user_id: idString(d.userId),
        user_name: text(d.userName),
        consent_type: text(d.consentType),
        granted: typeof d.granted === "boolean" ? d.granted : undefined,
        source: text(d.source),
        policy_version: text(d.policyVersion),
        receipt_id: text(d.receiptId),
        ip_address: text(d.ipAddress),
      },
      ["user_id", "consent_type", "granted"],
    ),
  email_log: (d) => {
    const sentAt = epochMs(d.sentAt) ?? epochMs(d.createdAt);
    return finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt) ?? sentAt,
        sent_at: sentAt,
        user_id: text(d.userId),
        to_address: text(d.to),
        subject: text(d.subject),
        category: text(d.category),
        status: text(d.status),
        message_id: text(d.messageId),
        error_message: text(d.errorMessage),
        source: text(d.source),
        metadata: json(d.metadata),
      },
      ["sent_at", "to_address", "category", "status", "source"],
    );
  },
  whatsapp_log: (d) => {
    const sentAt = epochMs(d.sentAt) ?? epochMs(d.createdAt);
    return finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt) ?? sentAt,
        sent_at: sentAt,
        status_at: epochMs(d.statusAt),
        user_id: text(d.userId),
        to_number: text(d.to),
        wa_message_id: text(d.waMessageId),
        kind: text(d.kind),
        template_name: text(d.templateName),
        template_language: text(d.templateLanguage),
        source: text(d.source),
        category: text(d.category),
        notification_type: text(d.notificationType),
        status: text(d.status),
        error_code: int(d.errorCode),
        error_kind: text(d.errorKind),
        error_message: text(d.errorMessage),
        skip_reason: text(d.skipReason),
        schedule_id: text(d.scheduleId),
        broadcast_id: text(d.broadcastId),
        conversation_category: text(d.conversationCategory),
      },
      ["sent_at", "to_number", "kind", "source", "category", "status"],
    );
  },
  activity_event: (d) =>
    finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt),
        job_seeker_id: idString(d.jobSeekerId),
        type: text(d.type),
        priority: int(d.priority),
        metadata: json(d.metadata),
      },
      ["job_seeker_id", "type"],
    ),
  profile_view: (d) => {
    const viewedAt = epochMs(d.viewedAt) ?? epochMs(d.createdAt);
    return finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt) ?? viewedAt,
        viewed_at: viewedAt,
        job_seeker_id: idString(d.jobSeekerId),
        viewer_id: idString(d.viewerId),
        viewer_role: text(d.viewerRole),
        source: text(d.source),
        notified_at: epochMs(d.notifiedAt),
      },
      ["viewed_at", "job_seeker_id", "viewer_id", "viewer_role"],
    );
  },
  company_profile_view: (d) => {
    const viewedAt = epochMs(d.viewedAt) ?? epochMs(d.createdAt);
    return finish(
      {
        id: idString(d._id),
        created_at: epochMs(d.createdAt) ?? viewedAt,
        viewed_at: viewedAt,
        viewer_id: idString(d.viewerId),
        employer_id: idString(d.employerId),
      },
      ["viewed_at", "viewer_id", "employer_id"],
    );
  },
  resource_download: (d) => {
    // The collection has no timestamps: the download time is the creation time.
    const at = epochMs(d.downloadedAt);
    return finish(
      {
        id: idString(d._id),
        created_at: at,
        downloaded_at: at,
        resource_id: idString(d.resourceId),
        user_id: idString(d.userId),
        file_key: text(d.fileKey),
        file_name: text(d.fileName),
      },
      ["downloaded_at", "resource_id", "user_id", "file_key", "file_name"],
    );
  },
};

/** The D1 row for one Mongo log document, or null when it lacks a required value. */
export function toD1Row(table: LogTable, doc: unknown): D1Row | null {
  if (!doc || typeof doc !== "object") return null;
  return MAPPERS[table](plain(doc));
}
