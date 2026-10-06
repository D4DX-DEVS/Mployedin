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

    // The register keeps only the anonymised identity. An atomic write, so
    // nothing concurrent can stop the completed status landing after erasure.
    // The reason the user typed goes too: it is their own words and can name
    // them, so it is part of the data being erased.
    const completedAt = new Date();
    const done = {
      status: "completed" as const,
      handledBy: ctx.userId,
      completedAt,
      userName: "Deleted User",
      userEmail: anonymizedEmail,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
    };
    await GdprRequest.updateOne(
      { _id: request._id },
      body.notes !== undefined ? { $set: done } : { $set: done, $unset: { notes: 1 } },
    );
    Object.assign(request, done);
    if (body.notes === undefined) request.notes = undefined;
  } else {
    request.status = to;
    request.handledBy = ctx.userId as unknown as typeof request.handledBy;
    if (body.notes !== undefined) request.notes = body.notes;
    if (to === "completed") request.completedAt = new Date();
    await request.save();
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.request.status_changed",
    resource: "gdpr",
    resourceId: String(request._id),
    changes: { before: { status: from }, after: { status: to } },
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
      completedAt: request.completedAt,
      handledBy: request.handledBy ? String(request.handledBy) : undefined,
      createdAt: request.createdAt,
    },
  });
}

export const PATCH = withAuth(patchHandler, { resource: "users", action: "update" });
