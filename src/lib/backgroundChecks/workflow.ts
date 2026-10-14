import mongoose from "mongoose";
import BackgroundCheck, { type BackgroundCheckOutcome } from "@/models/BackgroundCheck";
import type { BackgroundCheckAction } from "@/lib/validators/backgroundChecks";

/**
 * Who runs a background check, and how one person's work is kept from being
 * overwritten by another's (owner decision 2026-10-14).
 *
 * A check is run by exactly one performer at a time: an employer colleague or
 * one of the agents who work with the employer. The employer may hand it to
 * either. A check nobody holds goes to whoever presses Start first — the claim
 * is a single conditional update, so two people pressing at once cannot both
 * win. After that only the holder records progress and the verdict; everyone
 * else in scope can read it, and the employer can hand it on.
 *
 * Every write below carries its own precondition (status, holder) inside the
 * update filter, so a check that changed between the reader's page load and
 * their click is refused instead of silently overwritten.
 */

export const OPEN_STATUSES = ["pending", "in_progress"] as const;

export interface CheckActor {
  /** The real person — never the owner id a colleague's session borrows. */
  userId: string;
  /** Employer side runs the company's checks; staff side is an agent. */
  side: "employer" | "staff";
  /** Owner or a colleague who manages the team: may assign and cancel. */
  canManage: boolean;
  /** May this person run checks at all (start, record, complete)? */
  canPerform: boolean;
}

export interface StoredCheckState {
  status: string;
  checkType?: string;
  assignedTo?: unknown;
  references?: Array<{ status?: string }>;
  backgroundResults?: string;
}

export interface ViewerFlags {
  canStart: boolean;
  canWork: boolean;
  canAssign: boolean;
  canCancel: boolean;
  canEditNotes: boolean;
  /** Someone else holds the check; this viewer may only read it. */
  heldByOther: boolean;
}

/** The id held in a populated or unpopulated ref. */
export function refId(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "object" && value !== null && "_id" in value) return String((value as { _id: unknown })._id);
  return String(value);
}

export function viewerFlags(check: StoredCheckState, actor: CheckActor): ViewerFlags {
  const open = (OPEN_STATUSES as readonly string[]).includes(check.status);
  const holder = refId(check.assignedTo);
  const mine = holder === actor.userId;
  return {
    canStart: open && actor.canPerform && (holder === null || (mine && check.status === "pending")),
    canWork: check.status === "in_progress" && mine && actor.canPerform,
    canAssign: open && actor.side === "employer" && actor.canManage,
    canCancel: open && actor.side === "employer" && actor.canManage,
    canEditNotes: actor.side === "employer",
    heldByOther: open && holder !== null && !mine,
  };
}

export type ActionResult =
  | { ok: true; event: CheckEvent | null }
  | { ok: false; status: number; error: string; code: string };

/** What the activity history records for one action. Ids only — names resolve when read. */
export interface CheckEvent {
  action: string;
  meta: Record<string, unknown>;
}

const fail = (status: number, code: string, error: string): ActionResult => ({ ok: false, status, code, error });

/**
 * A completed check needs evidence for the verdict it carries: a written
 * summary always, and for a "clear" reference check at least one referee who
 * actually replied. Clicking Complete is never enough on its own.
 */
export function completionProblem(
  check: StoredCheckState,
  outcome: BackgroundCheckOutcome,
  summary: string
): { code: string; error: string } | null {
  if (outcome === "pending") return { code: "needs_outcome", error: "Choose a result before completing the check." };
  if (!summary.trim()) {
    return { code: "needs_summary", error: "Write a short summary of what was verified before completing the check." };
  }
  const hasReferences = check.checkType === "reference" || check.checkType === "both";
  if (outcome === "clear" && hasReferences && !(check.references ?? []).some((r) => r.status === "responded")) {
    return { code: "needs_reply", error: "A check can only be marked clear once at least one referee has replied." };
  }
  return null;
}

/** Why a guarded update matched nothing, read back from the stored check. */
async function explainMiss(
  filter: Record<string, unknown>,
  actor: CheckActor | null,
  needsStart: boolean
): Promise<ActionResult> {
  const current = (await BackgroundCheck.findOne(filter).select("status assignedTo").lean()) as StoredCheckState | null;
  if (!current) return fail(404, "not_found", "Background check not found.");
  if (!(OPEN_STATUSES as readonly string[]).includes(current.status)) {
    return fail(409, "closed", "This check is already closed.");
  }
  const holder = refId(current.assignedTo);
  // Assigning and cancelling don't depend on who holds the check (actor null).
  if (actor && holder !== null && holder !== actor.userId) {
    return fail(409, "held_by_other", "Someone else is handling this check.");
  }
  if (needsStart && current.status === "pending") return fail(409, "not_started", "Start the check first.");
  return fail(409, "changed", "This check changed while you were working. Reload it and try again.");
}

interface RunOptions {
  checkId: string;
  /** Narrows the check to what this caller may touch (employer id, staff scope). */
  scope: Record<string, unknown>;
  actor: CheckActor;
  body: BackgroundCheckAction;
  /** User ids the employer may hand the check to (colleagues + agents). */
  assignable?: () => Promise<Set<string>>;
}

export async function runCheckAction({ checkId, scope, actor, body, assignable }: RunOptions): Promise<ActionResult> {
  const me = new mongoose.Types.ObjectId(actor.userId);
  const base = { _id: checkId, ...scope };
  const now = new Date();

  switch (body.action) {
    case "start": {
      if (!actor.canPerform) return fail(403, "forbidden", "You can't run background checks.");
      // Claim an unheld check, or start one that was handed to me.
      const claimed = await BackgroundCheck.findOneAndUpdate(
        { ...base, status: { $in: OPEN_STATUSES }, assignedTo: null },
        { $set: { status: "in_progress", assignedTo: me, assignedBy: me, assignedAt: now } },
        { returnDocument: "before" }
      ).select("status").lean() as { status: string } | null;
      if (claimed) {
        return { ok: true, event: { action: "background_check.start", meta: { fromStatus: claimed.status, claimed: true } } };
      }
      const mine = await BackgroundCheck.findOneAndUpdate(
        { ...base, status: { $in: OPEN_STATUSES }, assignedTo: me },
        { $set: { status: "in_progress" } },
        { returnDocument: "before" }
      ).select("status").lean() as { status: string } | null;
      if (mine) {
        // Pressing Start on a check already under way is a no-op, not a new event.
        return { ok: true, event: mine.status === "in_progress" ? null : { action: "background_check.start", meta: { fromStatus: mine.status } } };
      }
      return explainMiss(base, actor, false);
    }

    case "progress": {
      if (!actor.canPerform) return fail(403, "forbidden", "You can't run background checks.");
      const set: Record<string, unknown> = {};
      const filter: Record<string, unknown> = { ...base, status: "in_progress", assignedTo: me };
      const meta: Record<string, unknown> = {};
      if (body.backgroundResults !== undefined) {
        set.backgroundResults = body.backgroundResults;
        meta.resultsUpdated = true;
      }
      if (body.reference) {
        const i = body.reference.index;
        filter[`references.${i}`] = { $exists: true };
        meta.referenceIndex = i;
        if (body.reference.status) {
          set[`references.${i}.status`] = body.reference.status;
          if (body.reference.status === "responded") set[`references.${i}.respondedAt`] = now;
          meta.referenceStatus = body.reference.status;
        }
        if (body.reference.feedback !== undefined) {
          set[`references.${i}.feedback`] = body.reference.feedback;
          meta.feedbackUpdated = true;
        }
      }
      if (Object.keys(set).length === 0) return fail(400, "empty", "Nothing to update.");
      const updated = await BackgroundCheck.findOneAndUpdate(filter, { $set: set }).select("_id").lean();
      if (updated) return { ok: true, event: { action: "background_check.progress", meta } };
      if (body.reference) {
        const exists = await BackgroundCheck.exists({ ...base, [`references.${body.reference.index}`]: { $exists: true } });
        if (!exists) return fail(404, "reference_not_found", "Reference not found.");
      }
      return explainMiss(base, actor, true);
    }

    case "complete": {
      if (!actor.canPerform) return fail(403, "forbidden", "You can't run background checks.");
      const current = (await BackgroundCheck.findOne({ ...base, status: "in_progress", assignedTo: me })
        .select("status checkType assignedTo references.status backgroundResults updatedAt")
        .lean()) as (StoredCheckState & { updatedAt?: Date }) | null;
      if (!current) return explainMiss(base, actor, true);
      const summary = body.backgroundResults ?? current.backgroundResults ?? "";
      const problem = completionProblem(current, body.outcome, summary);
      if (problem) return fail(422, problem.code, problem.error);
      // updatedAt pins the evidence read above: a referee answer changed in
      // between makes this miss rather than complete on stale facts.
      const done = await BackgroundCheck.findOneAndUpdate(
        { ...base, status: "in_progress", assignedTo: me, updatedAt: current.updatedAt },
        {
          $set: {
            status: "completed",
            outcome: body.outcome,
            backgroundResults: summary,
            completedAt: now,
            verifiedBy: me,
            verifiedAt: now,
          },
        }
      ).select("_id").lean();
      if (!done) return explainMiss(base, actor, true);
      return { ok: true, event: { action: "background_check.complete", meta: { outcome: body.outcome } } };
    }

    case "assign": {
      if (actor.side !== "employer" || !actor.canManage) {
        return fail(403, "forbidden", "Only the account owner or a team manager can assign a check.");
      }
      const target = body.assignedTo;
      if (target !== null) {
        const allowed = assignable ? await assignable() : new Set<string>();
        if (!allowed.has(target)) return fail(422, "not_assignable", "This person can't run background checks for your company.");
      }
      const before = await BackgroundCheck.findOneAndUpdate(
        { ...base, status: { $in: OPEN_STATUSES } },
        target === null
          ? { $set: { assignedBy: me, assignedAt: now }, $unset: { assignedTo: "" } }
          : { $set: { assignedTo: new mongoose.Types.ObjectId(target), assignedBy: me, assignedAt: now } },
        { returnDocument: "before" }
      ).select("assignedTo").lean() as { assignedTo?: unknown } | null;
      if (!before) return explainMiss(base, null, false);
      const from = refId(before.assignedTo);
      if (from === target) return { ok: true, event: null };
      return { ok: true, event: { action: "background_check.assign", meta: { from, to: target } } };
    }

    case "cancel": {
      if (actor.side !== "employer" || !actor.canManage) {
        return fail(403, "forbidden", "Only the account owner or a team manager can cancel a check.");
      }
      const before = await BackgroundCheck.findOneAndUpdate(
        { ...base, status: { $in: OPEN_STATUSES } },
        { $set: { status: "cancelled" } },
        { returnDocument: "before" }
      ).select("status").lean() as { status: string } | null;
      if (!before) return explainMiss(base, null, false);
      return { ok: true, event: { action: "background_check.cancel", meta: { fromStatus: before.status } } };
    }

    case "notes": {
      // The employer's own notes on the request. Agents never see or edit them.
      if (actor.side !== "employer") return fail(403, "forbidden", "Only the employer's team can edit these notes.");
      const updated = await BackgroundCheck.findOneAndUpdate(base, { $set: { backgroundNotes: body.backgroundNotes } })
        .select("_id")
        .lean();
      if (!updated) return fail(404, "not_found", "Background check not found.");
      return { ok: true, event: { action: "background_check.notes", meta: {} } };
    }
  }
}

/** Check types overlap when either asks for what the other already covers. */
export function checkTypesOverlap(a: string, b: string): boolean {
  return a === b || a === "both" || b === "both";
}
