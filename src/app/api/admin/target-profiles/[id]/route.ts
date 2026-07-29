import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import { targetProfileUpdateSchema } from "@/lib/validators/targetProfiles";
import { enrichProfile } from "@/lib/targets/profileAchievementCalculator";
import { validateDistributionSum } from "@/lib/targets/distributionStrategies";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyTargetUpdated } from "@/lib/notifications/trigger";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-profiles/[id]                               */
/* ------------------------------------------------------------------ */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const profile = await TargetProfile.findById(id).lean();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const enriched = await enrichProfile(profile as unknown as Record<string, unknown>);
  const assignee = await User.findById(profile.assigneeId).select("name email").lean();

  // Get child agent profiles if this is a supervisor
  let agentProfiles: unknown[] = [];
  if (profile.assigneeRole === "super_agent") {
    const children = await TargetProfile.find({
      parentProfileId: profile._id,
      status: { $ne: "cancelled" },
    }).lean();

    const childUserIds = [...new Set(children.map((c) => String(c.assigneeId)))];
    const childUsers = await User.find({ _id: { $in: childUserIds } })
      .select("_id name email")
      .lean();
    const childUserMap = new Map(childUsers.map((u) => [String(u._id), u]));

    const enrichedChildren = await Promise.all(
      children.map(async (c) => {
        const e = await enrichProfile(c as unknown as Record<string, unknown>);
        const u = childUserMap.get(e.assigneeId);
        return { ...e, assigneeName: u?.name ?? "Unknown", assigneeEmail: u?.email ?? "" };
      })
    );
    agentProfiles = enrichedChildren;
  }

  return NextResponse.json({
    profile: {
      ...enriched,
      assigneeName: assignee?.name ?? "Unknown",
      assigneeEmail: assignee?.email ?? "",
    },
    agentProfiles,
  });
}

/* ------------------------------------------------------------------ */
/*  PATCH  /api/admin/target-profiles/[id]                             */
/* ------------------------------------------------------------------ */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const body = await validateBody(req, targetProfileUpdateSchema);

  // If updating monthly targets, validate sums
  if (body.monthlyTargets) {
    const current = await TargetProfile.findById(id).lean();
    if (!current) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const annual = {
      employerTarget: body.employerTarget ?? current.employerTarget,
      employeeTarget: body.employeeTarget ?? current.employeeTarget,
      financeTarget: body.financeTarget ?? current.financeTarget,
    };
    const validation = validateDistributionSum(annual, body.monthlyTargets);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors.join("; ") }, { status: 400 });
    }
  }

  const profile = await TargetProfile.findByIdAndUpdate(
    id,
    { $set: body },
    { returnDocument: "after" }
  ).lean();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.update",
    resource: "targets",
    resourceId: id,
    meta: body,
    req,
  });

  const shouldNotify = [
    "employerTarget",
    "employeeTarget",
    "financeTarget",
    "currency",
    "distributionStrategy",
    "monthlyTargets",
  ].some((key) => key in body);

  if (shouldNotify) {
    void notifyTargetUpdated(
      String(profile.assigneeId),
      profile.assigneeRole as "agent" | "super_agent",
      id,
      profile.year,
      ctx.locale
    );
  }

  return NextResponse.json({ profile });
}

/* ------------------------------------------------------------------ */
/*  DELETE  /api/admin/target-profiles/[id]                            */
/* ------------------------------------------------------------------ */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();
  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const profile = await TargetProfile.findByIdAndUpdate(
    id,
    { $set: { status: "cancelled" } },
    { returnDocument: "after" }
  ).lean();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Cancel child agent profiles too
  await TargetProfile.updateMany(
    { parentProfileId: id },
    { $set: { status: "cancelled" } }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.cancel",
    resource: "targets",
    resourceId: id,
    req,
  });

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "targets", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "targets", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "targets", action: "delete" });
