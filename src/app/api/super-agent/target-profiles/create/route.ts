import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import { kpi3ProfileCreateSchema } from "@/lib/validators/targetProfiles";
import { getSuperAgentTeam } from "@/lib/auth/agentRestrictions";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { toStoredPeriods } from "@/lib/targets/schedule";
import { equalKpiPeriods } from "@/lib/targets/kpiSchedule";
import SuperAgent from "@/models/SuperAgent";

interface AuthCtx { userId: string; role: string; locale: string; }

/**
 * POST /api/super-agent/target-profiles/create
 *
 * Super agent creates a kpi3 target for one of their team agents.
 * - Team scope: 404 if agent not in team
 * - Revenue permission: 403 if revenueTarget > 0 and canSetRevenueTargets is false
 * - Admin-set targets: 403 if trying to edit a target with setByRole="admin" or overriddenByAdmin=true
 * - Audit: logs the creation with before/after values
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const body = await validateBody(req, kpi3ProfileCreateSchema);

  // Verify the target is for an agent in this SA's team
  const team = await getSuperAgentTeam(ctx.userId);
  if (!team || !team.agentUserIds.some((id) => String(id) === String(body.assigneeId))) {
    return NextResponse.json({ error: "That agent is not in your team" }, { status: 404 });
  }

  // Check revenue target permission
  if (body.revenueTarget && body.revenueTarget > 0) {
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("canSetRevenueTargets").lean();
    if (!sa?.canSetRevenueTargets) {
      return NextResponse.json(
        { error: "You don't have permission to set revenue targets" },
        { status: 403 }
      );
    }
  }

  // Check if a target already exists for this agent/year
  const existing = await TargetProfile.findOne({
    assigneeId: String(body.assigneeId),
    assigneeRole: "agent",
    year: body.year,
    status: { $ne: "cancelled" },
  }).lean();

  if (existing) {
    // If admin-set or overridden by admin, super agent can't edit
    if (existing.setByRole === "admin" || existing.overriddenByAdmin) {
      return NextResponse.json(
        { error: "This target was set by admin and cannot be edited" },
        { status: 403 }
      );
    }

    // Update existing target
    const before = {
      jobTarget: existing.jobTarget,
      conversionTarget: existing.conversionTarget,
      revenueTarget: existing.revenueTarget,
    };
    const after = {
      jobTarget: body.jobTarget ?? existing.jobTarget ?? 0,
      conversionTarget: body.conversionTarget ?? existing.conversionTarget ?? 0,
      revenueTarget: body.revenueTarget ?? existing.revenueTarget ?? 0,
    };

    const updated = await TargetProfile.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          jobTarget: after.jobTarget,
          conversionTarget: after.conversionTarget,
          revenueTarget: after.revenueTarget,
          currency: body.currency ?? existing.currency ?? "AED",
          notes: body.notes,
          periods: toStoredPeriods(equalKpiPeriods(body.year, after)),
          setByRole: "super_agent",
          overriddenByAdmin: false,
        },
      },
      { new: true }
    ).lean();

    // Audit the edit
    await logActivity({
      ...actorFromCtx(ctx),
      action: "target.update",
      resource: "targets",
      resourceId: String(existing._id),
      changes: { before, after },
      meta: { reason: body.notes || "Updated target", setByRole: "super_agent" },
      req,
    });

    return NextResponse.json({ profile: updated });
  }

  // Create new target
  const newProfile = new TargetProfile({
    assigneeId: String(body.assigneeId),
    assigneeRole: "agent",
    assignedBy: ctx.userId,
    year: body.year,
    region: body.region,
    periodType: "monthly",
    distributionStrategy: "equal",
    jobTarget: body.jobTarget,
    conversionTarget: body.conversionTarget,
    revenueTarget: body.revenueTarget,
    // Profit is an admin-only finance figure (R9); super agents never set it.
    profitTarget: 0,
    currency: body.currency ?? "AED",
    notes: body.notes,
    // Yearly totals split equally over the 12 months (whole jobs/hires, revenue to the cent).
    periods: toStoredPeriods(equalKpiPeriods(body.year, {
      jobTarget: body.jobTarget ?? 0,
      conversionTarget: body.conversionTarget ?? 0,
      revenueTarget: body.revenueTarget ?? 0,
    })),
    targetType: "kpi3",
    setByRole: "super_agent",
    overriddenByAdmin: false,
    status: "active",
  });

  const saved = await newProfile.save();

  // Audit the creation
  await logActivity({
    ...actorFromCtx(ctx),
    action: "target.create",
    resource: "targets",
    resourceId: String(saved._id),
    req,
    changes: {
      after: {
        jobTarget: body.jobTarget,
        conversionTarget: body.conversionTarget,
        revenueTarget: body.revenueTarget,
      },
    },
    meta: { reason: body.notes || "Created target", setByRole: "super_agent" },
  });

  return NextResponse.json({ profile: saved }, { status: 201 });
}

// Role is checked in the handler; team scope decides which agents.
export const POST = withAuth(handler);
