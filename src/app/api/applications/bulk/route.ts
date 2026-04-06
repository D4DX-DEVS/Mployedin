import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { bulkActionSchema } from "@/lib/validators/applications";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown";
  const { allowed } = checkRateLimit(`bulk:${ctx.userId ?? ip}`, RATE_LIMIT_CONFIGS.bulk);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  await connectDB();

  const body = await validateBody(req, bulkActionSchema);
  const { applicationIds, action, params } = body;

  // Only employers, agents, super_agents, admins can perform bulk actions
  if (!["employer", "agent", "super_agent", "admin"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // For employers: verify they own these applications
  let employerId: string | null = null;
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
    employerId = String(emp._id);
  }

  // Build the update payload
  const now = new Date();
  let updateFields: Record<string, unknown> = {};
  let newStatus: string | undefined;

  if (action === "reject") {
    newStatus = "rejected";
    updateFields = {
      status: "rejected",
      ...(params?.rejectionReason && { rejectionReason: params.rejectionReason }),
    };
  } else if (action === "move_stage") {
    if (!params?.targetStage) {
      return NextResponse.json({ error: "targetStage is required for move_stage action" }, { status: 400 });
    }
    newStatus = params.targetStage;
    updateFields = { status: params.targetStage };
  } else if (action === "send_message") {
    // Message sending is handled by the communications system — not a status change
    return NextResponse.json({ error: "send_message not yet implemented" }, { status: 501 });
  }

  // Fetch applications to validate ownership and push status history
  const query: Record<string, unknown> = { _id: { $in: applicationIds } };
  if (employerId) query.employerId = employerId;

  const applications = await Application.find(query).select("_id status employerId");

  if (!applications.length) {
    return NextResponse.json({ error: "No matching applications found" }, { status: 404 });
  }

  if (applications.length !== applicationIds.length && ctx.role === "employer") {
    return NextResponse.json(
      { error: "Some applications do not belong to your account" },
      { status: 403 }
    );
  }

  // Update each and push status history
  let successCount = 0;
  const errors: string[] = [];

  for (const app of applications) {
    try {
      if (newStatus && app.status !== newStatus) {
        app.status = newStatus as typeof app.status;
        app.statusHistory.push({
          status: newStatus as typeof app.status,
          changedAt: now,
          changedBy: ctx.userId as unknown as import("mongoose").Types.ObjectId,
          note: params?.rejectionReason ?? `Bulk action: ${action}`,
        });
      }
      if (action === "reject" && params?.rejectionReason) {
        app.rejectionReason = params.rejectionReason;
      }
      await app.save();
      successCount++;
    } catch (err) {
      errors.push(`Application ${app._id}: ${err instanceof Error ? err.message : "Unknown"}`);
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "application.bulk_action",
    resource: "applications",
    meta: { action, count: successCount, applicationIds },
    req,
  });

  return NextResponse.json({
    success: true,
    processed: successCount,
    total: applications.length,
    errors: errors.length ? errors : undefined,
  });
}

export const POST = withAuth(postHandler, { resource: "applications", action: "update" });
