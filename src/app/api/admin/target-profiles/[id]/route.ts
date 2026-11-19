import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile, { PROFIT_TARGET_FILTER } from "@/models/TargetProfile";
import { validateBody } from "@/lib/validators";
import { targetProfileUpdateSchema, kpi3ProfileUpdateSchema } from "@/lib/validators/targetProfiles";
import { enrichProfile, enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import { resolveSchedule, toStoredPeriods, type PeriodType, type SplitStrategy } from "@/lib/targets/schedule";
import { equalKpiPeriods, kpiPeriodIssues, manualKpiPeriods } from "@/lib/targets/kpiSchedule";
import { allocatedProfitCents, checkProfitBudget, profitToCents } from "@/lib/targets/budget";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyTargetUpdated } from "@/lib/notifications/trigger";
import User from "@/models/User";
import { calculateKpis, kpiOwnerKey } from "@/lib/targets/kpiCalculator";
import { fromStoredPeriods } from "@/lib/targets/schedule";

interface AuthCtx { userId: string; role: string; locale: string; }

/** The update minus its `periods`, which arrive as date strings and are stored as dates. */
function withoutPeriods<T extends { periods?: unknown }>(body: T): Omit<T, "periods"> {
  const { periods, ...rest } = body;
  void periods;
  return rest;
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000,
  );
}

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

  const profile = await TargetProfile.findOne({ _id: id, ...PROFIT_TARGET_FILTER }).lean();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const enriched = await enrichProfile(profile as unknown as Record<string, unknown>);
  const assignee = await User.findById(profile.assigneeId).select("name email").lean();

  // Get child agent profiles if this is a supervisor
  let agentProfiles: unknown[] = [];
  if (profile.assigneeRole === "super_agent") {
    const children = await TargetProfile.find({
      ...PROFIT_TARGET_FILTER,
      parentProfileId: profile._id,
      status: { $ne: "cancelled" },
    }).lean();

    const childUserIds = [...new Set(children.map((c) => String(c.assigneeId)))];
    const childUsers = await User.find({ _id: { $in: childUserIds } })
      .select("_id name email")
      .lean();
    const childUserMap = new Map(childUsers.map((u) => [String(u._id), u]));

    const enrichedChildren = await enrichProfiles(children as unknown as Record<string, unknown>[]);
    agentProfiles = enrichedChildren.map((e) => {
      const u = childUserMap.get(e.assigneeId);
      return { ...e, assigneeName: u?.name ?? "Unknown", assigneeEmail: u?.email ?? "" };
    });
  }

  let kpi: unknown = null;
  const profileRecord = profile as unknown as Record<string, unknown>;
  if (profileRecord.targetType === "kpi3" && profile.periods) {
    const kpiResults = await calculateKpis(
      [
        {
          userId: String(profile.assigneeId),
          role: profile.assigneeRole as "agent" | "super_agent",
          currency: profile.currency,
          periods: fromStoredPeriods(profile.periods),
        },
      ],
      profile.year,
    );
    const kpiData = kpiResults.get(kpiOwnerKey(profile.assigneeRole as "agent" | "super_agent", String(profile.assigneeId)));
    if (kpiData) {
      kpi = {
        months: kpiData.months,
        totals: kpiData.totals,
        otherCurrencies: kpiData.otherCurrencies,
        commission: kpiData.commission,
        byAgent: kpiData.byAgent.size > 0 ? Array.from(kpiData.byAgent.entries()).map(([agentId, counts]) => ({ agentId, ...counts })) : [],
      };
    }
  }

  return NextResponse.json({
    profile: {
      ...enriched,
      assigneeName: assignee?.name ?? "Unknown",
      assigneeEmail: assignee?.email ?? "",
    },
    agentProfiles,
    ...(kpi ? { kpi } : {}),
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

  // Get the current profile to determine its type
  const current = await TargetProfile.findOne({ _id: id, ...PROFIT_TARGET_FILTER }).lean();
  if (!current) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Use the appropriate schema based on targetType
  const schema = current.targetType === "kpi3" ? kpi3ProfileUpdateSchema : targetProfileUpdateSchema;
  const body = await validateBody(req, schema);

  const bodyRecord = body as unknown as Record<string, unknown>;
  const changesSchedule =
    body.profitTarget !== undefined ||
    bodyRecord.jobTarget !== undefined ||
    bodyRecord.conversionTarget !== undefined ||
    bodyRecord.revenueTarget !== undefined ||
    body.periodType !== undefined ||
    body.distributionStrategy !== undefined ||
    body.periods !== undefined;
  if ((changesSchedule || body.currency !== undefined) && current.status !== "active") {
    return NextResponse.json({ error: "Only active target profiles can be edited" }, { status: 409 });
  }

  const annual = body.profitTarget ?? current.profitTarget;
  const periodType = (body.periodType ?? current.periodType ?? "monthly") as PeriodType;
  const strategy = (body.distributionStrategy ?? current.distributionStrategy ?? "equal") as SplitStrategy;

  // The periods must always add up to the year. A new amount, split or period
  // type without periods re-cuts the year; a custom schedule or a hand-typed
  // split has no rule to re-cut from, so the caller must spell it out.
  let storedPeriods: ReturnType<typeof toStoredPeriods> | undefined;
  if (changesSchedule && current.targetType === "kpi3") {
    // kpi3: twelve months of three figures. Equal split built here; a manual one must add up.
    const totals = {
      jobTarget: (bodyRecord.jobTarget as number | undefined) ?? current.jobTarget ?? 0,
      conversionTarget: (bodyRecord.conversionTarget as number | undefined) ?? current.conversionTarget ?? 0,
      revenueTarget: (bodyRecord.revenueTarget as number | undefined) ?? current.revenueTarget ?? 0,
    };
    const manual = body.distributionStrategy === "custom" && body.periods;
    if (manual && kpiPeriodIssues(body.periods as never, totals).length > 0) {
      return NextResponse.json({ error: "The months must add up to each yearly target" }, { status: 400 });
    }
    storedPeriods = toStoredPeriods(manual ? manualKpiPeriods(current.year, body.periods as never) : equalKpiPeriods(current.year, totals));
  } else if (changesSchedule) {
    const schedule = resolveSchedule({ year: current.year, profitTarget: annual, periodType, strategy, periods: body.periods });
    if ("error" in schedule) {
      return NextResponse.json({ error: schedule.error, details: schedule.details }, { status: 400 });
    }
    storedPeriods = toStoredPeriods(schedule.periods);
  }

  // Agents are funded in their super agent's currency and out of its budget.
  if (body.currency !== undefined && body.currency !== current.currency) {
    const hasChildren = await TargetProfile.exists({ ...PROFIT_TARGET_FILTER, parentProfileId: id, status: "active" });
    if (hasChildren || current.parentProfileId) {
      return NextResponse.json(
        { error: "The currency of a target that is part of a team cannot be changed" },
        { status: 409 },
      );
    }
  }

  if (body.profitTarget !== undefined) {
    if (current.assigneeRole === "super_agent") {
      const allocated = await allocatedProfitCents(id);
      if (profitToCents(annual) < allocated) {
        return NextResponse.json(
          { error: "The target cannot be lower than what is already given to agents", allocated: allocated / 100 },
          { status: 409 },
        );
      }
    } else if (current.parentProfileId) {
      const parent = await TargetProfile.findOne({ _id: current.parentProfileId, ...PROFIT_TARGET_FILTER }).lean();
      if (parent) {
        const others = await allocatedProfitCents(parent._id, [id]);
        const budget = checkProfitBudget(parent.profitTarget, others, profitToCents(annual));
        if (!budget.withinBudget) {
          return NextResponse.json(
            { error: "The target is more than the super agent's target can fund", remaining: budget.remaining },
            { status: 409 },
          );
        }
      }
    }
  }

  // Collect changes for audit log
  const changes: { before: Record<string, unknown>; after: Record<string, unknown> } = { before: {}, after: {} };
  const fieldsToTrack = ["profitTarget", "currency", "region", "status"];

  // Add KPI fields only if the profile is KPI3 type
  if (current.targetType === "kpi3") {
    fieldsToTrack.push("jobTarget", "conversionTarget", "revenueTarget");
  }

  const currentRecord = current as unknown as Record<string, unknown>;
  for (const field of fieldsToTrack) {
    if (field in bodyRecord && bodyRecord[field] !== undefined) {
      const before = currentRecord[field];
      const after = bodyRecord[field];
      if (before !== after) {
        changes.before[field] = before;
        changes.after[field] = after;
      }
    }
  }

  // Track period changes
  if (body.periods !== undefined && storedPeriods) {
    changes.before.periods = current.periods;
    changes.after.periods = storedPeriods;
  }

  // If editing a super-agent-set target, mark it as overridden by admin
  const shouldMarkOverridden = current.setByRole === "super_agent" && Object.keys(changes.before).length > 0;

  let profile;
  try {
    profile = await TargetProfile.findOneAndUpdate(
      { _id: id, ...PROFIT_TARGET_FILTER },
      {
        $set: {
          ...withoutPeriods(body),
          ...(storedPeriods ? { periodType, distributionStrategy: strategy, periods: storedPeriods } : {}),
          ...(shouldMarkOverridden ? { overriddenByAdmin: true } : {}),
        },
      },
      { returnDocument: "after" }
    ).lean();
  } catch (error) {
    // Reactivating a profile whose person already has another active one.
    if (isDuplicateKeyError(error)) {
      return NextResponse.json(
        { error: "An active target profile already exists for this person and year" },
        { status: 409 },
      );
    }
    throw error;
  }

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Ending a super agent's target ends the agent targets funded from it.
  // Reactivating does not bring them back: each one needs a fresh decision.
  if (body.status && body.status !== "active" && body.status !== current.status) {
    await TargetProfile.updateMany(
      { ...PROFIT_TARGET_FILTER, parentProfileId: id, status: "active" },
      { $set: { status: body.status } },
    );
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.update",
    resource: "targets",
    resourceId: id,
    changes: Object.keys(changes.before).length > 0 ? changes : undefined,
    meta: {
      year: current.year,
      assigneeId: String(current.assigneeId),
      ...(body.reason ? { reason: body.reason } : {}),
    },
    req,
  });

  const shouldNotify = ["profitTarget", "currency", "distributionStrategy", "periodType", "periods"].some((key) => key in body);

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

  const profile = await TargetProfile.findOneAndUpdate(
    { _id: id, ...PROFIT_TARGET_FILTER },
    { $set: { status: "cancelled" } },
    { returnDocument: "after" }
  ).lean();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Cancel child agent profiles too
  await TargetProfile.updateMany(
    { ...PROFIT_TARGET_FILTER, parentProfileId: id },
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
