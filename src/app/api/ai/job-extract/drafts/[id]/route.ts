import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { ExtractionDraft } from "@/models/ExtractionDraft";
import { Employer } from "@/models/Employer";
import { validateBody } from "@/lib/validators";
import { patchExtractionDraftSchema } from "@/lib/validators/extractionDraft";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

/**
 * Authorisation guard shared by every mutation on a single draft. The caller
 * must own the draft (matched on employerId) — admins bypass. Prevents IDOR:
 * one employer must never read/patch another's draft by guessing the _id.
 */
async function assertOwnsDraft(ctx: AuthCtx, draftId: string) {
  if (!isValidObjectId(draftId)) {
    return { ok: false as const, response: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };
  }
  const draft = await ExtractionDraft.findById(draftId).lean();
  if (!draft) {
    return { ok: false as const, response: NextResponse.json({ error: "Draft not found" }, { status: 404 }) };
  }

  if (ctx.role === "admin") return { ok: true as const, draft };

  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer?._id || String(draft.employerId) !== String(employer._id)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, draft };
}

// ── GET /api/ai/job-extract/drafts/[id] ───────────────────────────────────
// Returns the full draft (jobs + selection) for the resume flow. The client
// uses this to rehydrate the ai-extract page after a Back/refresh/tab-return.
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing draft id" }, { status: 400 });

  await connectDB();
  const owned = await assertOwnsDraft(ctx, id);
  if (!owned.ok) return owned.response;

  // Already-expired drafts look the same as missing to the client.
  if (owned.draft.status !== "active" || new Date(owned.draft.expiresAt) <= new Date()) {
    return NextResponse.json({ error: "Draft no longer available" }, { status: 410 });
  }

  return NextResponse.json({ draft: owned.draft });
}

// ── PATCH /api/ai/job-extract/drafts/[id] ─────────────────────────────────
// Atomically update one or more job entries' status and/or replace the
// selection set. Used by:
//   - the ai-extract page when the user toggles checkboxes (selection only)
//   - POST /api/jobs (via a separate internal call) when a job is posted/skipped
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing draft id" }, { status: 400 });

  await connectDB();
  const owned = await assertOwnsDraft(ctx, id);
  if (!owned.ok) return owned.response;

  const body = await validateBody(req, patchExtractionDraftSchema);

  // Build a Mongoose update. We keep $set contents in a single typed object so
  // both the selection update and the per-position job-status updates land in
  // one atomic write.
  const setOps: Record<string, unknown> = {};
  if (body.selectedIndices !== undefined) {
    setOps.selectedIndices = body.selectedIndices;
  }
  if (body.jobUpdates && body.jobUpdates.length > 0) {
    for (const u of body.jobUpdates) {
      setOps[`jobs.${u.index}.status`] = u.status;
      if (u.status === "posted" && u.postedJobId) {
        setOps[`jobs.${u.index}.postedJobId`] = u.postedJobId;
      }
    }
  }

  if (Object.keys(setOps).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const updated = await ExtractionDraft.findByIdAndUpdate(
    owned.draft._id,
    { $set: setOps },
    { returnDocument: "after" }
  ).lean();

  // Auto-complete: if nothing is left pending, close the draft out so the
  // dashboard card disappears. (Posting the last job triggers this too, via
  // POST /api/jobs, but PATCH covers the "skip everything" path.)
  if (updated && updated.jobs.length > 0) {
    const pending = updated.jobs.filter((j: { status: string }) => j.status === "pending").length;
    if (pending === 0) {
      await ExtractionDraft.findByIdAndUpdate(updated._id, {
        status: "completed",
        completedAt: new Date(),
      });
    }
  }

  try {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai_extraction_draft.updated",
      resource: "ai_extraction_draft",
      resourceId: String(owned.draft._id),
      meta: {
        jobUpdates: body.jobUpdates?.length ?? 0,
        selectedChanged: body.selectedIndices !== undefined,
      },
    });
  } catch {
    // Audit log is non-blocking.
  }

  return NextResponse.json({ draft: updated });
}

// ── DELETE /api/ai/job-extract/drafts/[id] ────────────────────────────────
// Discards an active draft. Hard-deletes the document — the user's intent is
// explicit and the AI call already happened; no point keeping a tombstone.
async function deleteHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing draft id" }, { status: 400 });

  await connectDB();
  const owned = await assertOwnsDraft(ctx, id);
  if (!owned.ok) return owned.response;

  await ExtractionDraft.findByIdAndDelete(owned.draft._id);

  try {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai_extraction_draft.discarded",
      resource: "ai_extraction_draft",
      resourceId: String(owned.draft._id),
    });
  } catch {
    // Audit log is non-blocking.
  }

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { skipTenantView: true });
export const PATCH = withAuth(patchHandler, { skipTenantView: true });
export const DELETE = withAuth(deleteHandler, { skipTenantView: true });
