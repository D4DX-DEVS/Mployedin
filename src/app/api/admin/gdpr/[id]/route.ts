import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import GdprRequest, { GDPR_REQUEST_TRANSITIONS, type GdprRequestStatus } from "@/models/GdprRequest";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { adminGdprStatusSchema } from "@/lib/validators/admin";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { eraseUserPersonalData } from "@/lib/gdpr/erasure";
import { outcomeAuditFields, pickOutcomeFields } from "@/lib/gdpr/requestOutcome";
import logger from "@/lib/logger";

/* ------------------------------------------------------------------ */
/*  PATCH /api/admin/gdpr/[id] — move a data request through its states */
/* ------------------------------------------------------------------ */

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const body = await validateBody(req, adminGdprStatusSchema);
  // What the team recorded. Empty fields are dropped, and `notes` (the user's
  // own words) is not part of the schema, so it can never be written here.
  const recorded = pickOutcomeFields(body);

  await connectDB();
  const request = await GdprRequest.findById(params?.id);
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const from = request.status as GdprRequestStatus;
  const to = body.status as GdprRequestStatus;
  if (!GDPR_REQUEST_TRANSITIONS[from]?.includes(to)) {
    return NextResponse.json(
      { error: `Cannot move a ${from} request to ${to}` },
      { status: 409 },
    );
  }

  // A deletion whose erasure already ran (a failed or interrupted erasure leaves the request in progress with the
  // account deactivated) can't be refused: the person would be told "refused" about a scrubbed account. The admin
  // finishes it with Complete instead (the erasure is safe to run again).
  if (to === "rejected" && request.requestType === "delete") {
    const subject = await User.findById(request.userId).select("deletedAt").lean() as { deletedAt?: Date | null } | null;
    if (subject?.deletedAt) {
      return NextResponse.json(
        { error: "This account's erasure has already started. Complete the request to finish it.", code: "ERASURE_STARTED" },
        { status: 409 },
      );
    }
  }

  const erasing = to === "completed" && request.requestType === "delete";
  if (erasing) {
    // Admin accounts are never erased (they can't file a request either).
    const subjectUser = await User.findById(request.userId).select("role").lean() as { role?: string } | null;
    if (subjectUser?.role === "admin") {
      return NextResponse.json(
        { error: "Administrator accounts are never erased.", code: "ADMIN_ACCOUNT" },
        { status: 409 },
      );
    }

    // Claim the request before erasing: a user can only cancel a pending
    // request, so once it is in_progress nobody can withdraw it mid-erasure,
    // and a failed erasure leaves it in_progress for the admin to retry
    // (eraseUserPersonalData is safe to run twice).
    const claimed = await GdprRequest.findOneAndUpdate(
      { _id: request._id, status: from },
      { $set: { status: "in_progress", handledBy: ctx.userId } },
    );
    if (!claimed) {
      return NextResponse.json(
        { error: "This request changed in the meantime. Reload and try again.", code: "STALE" },
        { status: 409 },
      );
    }

    let anonymizedEmail: string;
    try {
      ({ anonymizedEmail } = await eraseUserPersonalData(String(request.userId)));
    } catch (err) {
      logger.error({ err, requestId: String(request._id), userId: String(request.userId) }, "[gdpr] admin erasure failed");
      return NextResponse.json(
        { error: "We couldn't complete the erasure. Please try again.", code: "ERASURE_FAILED" },
        { status: 500 },
      );
    }

    // The register keeps only the anonymised identity, plus what the team
    // recorded about the request. An atomic write, so nothing concurrent can
    // stop the completed status landing after erasure. The reason the user
    // typed and the address they filed from go too: they are personal data,
    // so they are part of the data being erased.
    const completedAt = new Date();
    const done = {
      status: "completed" as const,
      handledBy: ctx.userId,
      completedAt,
      userName: "Deleted User",
      userEmail: anonymizedEmail,
      ...recorded,
    };
    // The person's other requests carry the same name, e-mail, their own words and IP address: anonymise them too (UK GDPR Art 17).
    // Their status, outcome and the team's notes stay: that is the register of what was done. Done BEFORE this request is
    // marked completed: erasure, this and that write can each run twice, so a failure leaves the request in progress for a retry
    // instead of final, un-audited and with other rows still naming the person.
    try {
      await GdprRequest.updateMany(
        { userId: request.userId, _id: { $ne: request._id } },
        { $set: { userName: "Deleted User", userEmail: anonymizedEmail }, $unset: { notes: 1, ipAddress: 1 } },
      );
    } catch (err) {
      logger.error({ err, requestId: String(request._id), userId: String(request.userId) }, "[gdpr] admin erasure: anonymising the other requests failed");
      return NextResponse.json(
        { error: "We couldn't complete the erasure. Please try again.", code: "ERASURE_FAILED" },
        { status: 500 },
      );
    }
    await GdprRequest.updateOne({ _id: request._id }, { $set: done, $unset: { notes: 1, ipAddress: 1 } });
    Object.assign(request, done);
    request.notes = undefined;
  } else {
    request.status = to;
    request.handledBy = ctx.userId as unknown as typeof request.handledBy;
    Object.assign(request, recorded);
    // The decision date, for a refusal as much as a completion (GdprRequest.completedAt).
    if (to === "completed" || to === "rejected") request.completedAt = new Date();
    await request.save();
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.request.status_changed",
    resource: "gdpr",
    resourceId: String(request._id),
    changes: { before: { status: from }, after: { status: to, ...outcomeAuditFields(recorded) } },
    meta: {
      requestType: request.requestType,
      subjectUserId: String(request.userId),
      ...(erasing ? { erasurePerformed: true } : {}),
    },
    req,
  });

  return NextResponse.json({
    request: {
      _id: String(request._id),
      userId: String(request.userId),
      userName: request.userName,
      userEmail: request.userEmail,
      requestType: request.requestType,
      status: request.status,
      notes: request.notes,
      outcome: request.outcome,
      outcomeReason: request.outcomeReason,
      adminNotes: request.adminNotes,
      completedAt: request.completedAt,
      handledBy: request.handledBy ? String(request.handledBy) : undefined,
      createdAt: request.createdAt,
    },
  });
}

export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
