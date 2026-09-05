import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import GdprRequest, { GDPR_REQUEST_TRANSITIONS, type GdprRequestStatus } from "@/models/GdprRequest";
import { validateBody } from "@/lib/validators";
import { adminGdprStatusSchema } from "@/lib/validators/admin";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

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

  request.status = to;
  request.handledBy = ctx.userId as unknown as typeof request.handledBy;
  if (body.notes !== undefined) request.notes = body.notes;
  if (to === "completed") request.completedAt = new Date();
  await request.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.request.status_changed",
    resource: "gdpr",
    resourceId: String(request._id),
    changes: { before: { status: from }, after: { status: to } },
    meta: { requestType: request.requestType, subjectUserId: String(request.userId) },
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
