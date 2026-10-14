import type { NextRequest } from "next/server";
import AuditLog from "@/models/AuditLog";
import User from "@/models/User";
import { logActivity } from "@/lib/audit/log";
import type { CheckEvent } from "./workflow";

/**
 * A check's activity history is the audit log, read back. Every action writes
 * one `background_check.*` row (actor = the real person, never the owner whose
 * id a colleague's session borrows); nothing else stores the trail, so there
 * is no second copy to drift.
 */

const HISTORY_LIMIT = 100;

export interface CheckHistoryEntry {
  id: string;
  /** create | start | progress | complete | assign | cancel | notes | update | verify */
  action: string;
  at: string;
  actor: { name: string; kind: "agent" | "employer" | "staff" | "system" };
  meta: Record<string, unknown>;
}

interface StoredRow {
  _id: unknown;
  action: string;
  actorRole?: string;
  createdAt: Date;
  actorId?: { _id: unknown; name?: string; email?: string } | null;
  meta?: Record<string, unknown>;
}

function actorKind(role?: string): CheckHistoryEntry["actor"]["kind"] {
  if (role === "agent") return "agent";
  if (role === "employer") return "employer";
  if (role === "super_agent" || role === "admin") return "staff";
  return "system";
}

const ID_META_KEYS = ["from", "to"] as const;

/** Assignment rows store user ids; the reader gets names. */
async function nameIds(rows: StoredRow[]): Promise<Map<string, string>> {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const key of ID_META_KEYS) {
      const value = row.meta?.[key];
      if (typeof value === "string" && /^[a-f\d]{24}$/i.test(value)) ids.add(value);
    }
  }
  if (ids.size === 0) return new Map();
  const users = (await User.find({ _id: { $in: [...ids] } }).select("name email").lean()) as Array<{
    _id: unknown;
    name?: string;
    email?: string;
  }>;
  return new Map(users.map((u) => [String(u._id), u.name || u.email || ""]));
}

export async function getCheckHistory(checkId: string): Promise<CheckHistoryEntry[]> {
  const rows = (await AuditLog.find({
    resource: "applications",
    resourceId: checkId,
    action: { $regex: /^background_check\./ },
  })
    .select("action actorRole actorId meta createdAt")
    .populate({ path: "actorId", select: "name email" })
    .sort({ createdAt: 1 })
    .limit(HISTORY_LIMIT)
    .lean()) as unknown as StoredRow[];

  const names = await nameIds(rows);
  return rows.map((row) => {
    const meta: Record<string, unknown> = { ...(row.meta ?? {}) };
    for (const key of ID_META_KEYS) {
      const value = meta[key];
      if (typeof value === "string") meta[`${key}Name`] = names.get(value) ?? "";
    }
    return {
      id: String(row._id),
      action: row.action.replace(/^background_check\./, ""),
      at: new Date(row.createdAt).toISOString(),
      actor: { name: row.actorId?.name || row.actorId?.email || "", kind: actorKind(row.actorRole) },
      meta,
    };
  });
}

/** When the check was first started, read off its history. */
export function startedAt(history: CheckHistoryEntry[]): string | null {
  return history.find((h) => h.action === "start")?.at ?? null;
}

interface RecordOptions {
  checkId: string;
  event: CheckEvent;
  actor: { actorId: string; actorRole: string; onBehalfOfId?: string; onBehalfOfRole?: string };
  req: NextRequest;
}

/** Awaited, so the history the client re-reads right after already holds this row. */
export async function recordCheckEvent({ checkId, event, actor, req }: RecordOptions): Promise<void> {
  await logActivity({
    ...actor,
    action: event.action,
    resource: "applications",
    resourceId: checkId,
    meta: event.meta,
    req,
  });
}
