import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import GdprRequest from "@/models/GdprRequest";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

const cancelRequestSchema = z.object({ action: z.literal("cancel") });

/**
 * PATCH /api/gdpr/requests/[id] — the owner withdraws a request an admin has
 * not started yet. Anyone else's request reads as not found.
 */
async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) {
    return NextResponse.json({ error: "Invalid request ID" }, { status: 400 });
  }
  await validateBody(req, cancelRequestSchema);
  await connectDB();

  const request = await GdprRequest.findOne({ _id: params?.id, userId: ctx.userId });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (request.status !== "pending") {
    return NextResponse.json({ error: "Only a request that hasn't been started can be cancelled.", code: "NOT_PENDING" }, { status: 409 });
  }

  request.status = "cancelled";
  await request.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "gdpr.request_cancelled",
    resource: "gdpr",
    resourceId: String(request._id),
    changes: { before: { status: "pending" }, after: { status: "cancelled" } },
    meta: { requestType: request.requestType, subjectUserId: ctx.userId },
    req,
  });

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler);
