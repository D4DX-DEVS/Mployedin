/**
 * PATCH /api/subscriptions/upgrade-requests/[id]
 *
 * { action: "approve" | "decline" } — admin only. Approve applies the plan
 *   (history row, invoice for a paid plan, legacy Employer fields) and tells
 *   the customer; decline just tells them.
 * { action: "cancel" } — the customer who made the request withdraws it.
 */
import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody, commonSchemas } from "@/lib/validators";
import { upgradeRequestDecisionSchema } from "@/lib/validators/subscriptions";
import { applyPlanToUser, ApplyPlanError } from "@/lib/subscription/applyPlan";
import { notifyUpgradeDecided } from "@/lib/notifications/trigger";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import UpgradeRequest from "@/models/UpgradeRequest";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }


async function handler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const id = params?.id ?? "";
  if (!commonSchemas.objectId.safeParse(id).success) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }
  const body = await validateBody(req, upgradeRequestDecisionSchema);
  await connectDB();

  const request = await UpgradeRequest.findById(id);
  if (!request) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  if (request.status !== "pending") {
    return NextResponse.json({ error: `This request was already ${request.status}.` }, { status: 409 });
  }

  if (body.action === "cancel") {
    if (String(request.userId) !== ctx.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    request.status = "cancelled";
    request.decidedBy = request.userId;
    request.decidedAt = new Date();
    await request.save();
    return NextResponse.json({ request });
  }

  if (ctx.role !== "admin") return NextResponse.json({ error: "Only an admin can decide plan requests." }, { status: 403 });

  // Claim the request first so two admins clicking at once apply it once.
  const claimed = await UpgradeRequest.findOneAndUpdate(
    { _id: request._id, status: "pending" },
    {
      $set: {
        status: body.action === "approve" ? "approved" : "declined",
        decidedBy: ctx.userId,
        decidedAt: new Date(),
        decisionNote: body.note,
      },
    },
    { new: true },
  );
  if (!claimed) return NextResponse.json({ error: "Another admin already decided this request." }, { status: 409 });

  let invoiceId: string | undefined;
  if (body.action === "approve") {
    try {
      const result = await applyPlanToUser({
        userId: String(request.userId),
        planId: String(request.toPlanId),
        actorId: ctx.userId,
        actorRole: ctx.role,
        reason: body.note ?? "Approved plan request",
      });
      invoiceId = result.invoiceId;
    } catch (err) {
      // Put it back so it can be retried or declined.
      await UpgradeRequest.updateOne({ _id: request._id }, { $set: { status: "pending" }, $unset: { decidedBy: 1, decidedAt: 1, decisionNote: 1 } });
      if (err instanceof ApplyPlanError) return NextResponse.json({ error: err.message }, { status: err.status });
      throw err;
    }
  }

  await notifyUpgradeDecided({
    userId: String(request.userId),
    role: request.targetRole,
    toPlanName: request.toPlanName,
    approved: body.action === "approve",
  }).catch(() => undefined);

  await logActivity({
    ...actorFromCtx(ctx),
    action: `subscription.upgrade_${body.action === "approve" ? "approved" : "declined"}`,
    resource: "subscriptions",
    resourceId: String(request._id),
    meta: { userId: String(request.userId), toPlan: request.toPlanName, invoiceId },
    req,
  });

  return NextResponse.json({ request: claimed, invoiceId });
}

export const PATCH = withAuth(handler, { resource: "subscriptions", action: "read" });
