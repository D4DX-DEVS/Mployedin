/**
 * /api/subscriptions/upgrade-requests
 *
 * POST — an employer or job seeker asks to move to another plan. There is no
 *        payment gateway yet, so this replaces the "coming soon" dead end:
 *        admins (and an employer's agent + super agent) are notified and an
 *        admin approves it on /admin/subscriptions.
 * GET  — customer: their own open request ({ request }).
 *        admin: every request, paginated ({ data, page, pageSize, total, totalPages }).
 *        agent / super agent: requests from employers in their scope, read-only.
 */
import { NextRequest, NextResponse } from "next/server";
import type mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { validateBody, validateQuery } from "@/lib/validators";
import { upgradeRequestCreateSchema, upgradeRequestListSchema } from "@/lib/validators/subscriptions";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { isSubscriptionEnforcementEnabled } from "@/lib/subscription/enforcementFlag";
import { notifyUpgradeRequested } from "@/lib/notifications/trigger";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import connectDB from "@/lib/db/mongoose";
import UpgradeRequest from "@/models/UpgradeRequest";
import SubscriptionPlan from "@/models/SubscriptionPlan";
import Subscription from "@/models/Subscription";
import { Employer } from "@/models/Employer";
import { User } from "@/models/User";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

function customerRole(role: UserRole): "employer" | "job_seeker" | null {
  return role === "employer" ? "employer" : role === "job_seeker" ? "job_seeker" : null;
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  const targetRole = customerRole(ctx.role);
  if (!targetRole) return NextResponse.json({ error: "Only employers and job seekers have plans." }, { status: 403 });

  const { allowed } = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.checkout);
  if (!allowed) return NextResponse.json({ error: "Too many requests. Try again in a minute." }, { status: 429 });

  // While enforcement is off everyone already has every feature; a request
  // would only queue work nobody needs.
  if (!(await isSubscriptionEnforcementEnabled())) {
    return NextResponse.json({ error: "All features are already unlocked for everyone right now." }, { status: 409 });
  }

  const body = await validateBody(req, upgradeRequestCreateSchema);
  await connectDB();

  const plan = await SubscriptionPlan.findOne({ _id: body.planId, targetRole, isActive: true }).lean();
  if (!plan) return NextResponse.json({ error: "That plan is not available." }, { status: 404 });

  const current = await Subscription.findOne({ userId: ctx.userId, targetRole, status: "active" })
    .select("planId planSnapshot.name").lean<{ planId: mongoose.Types.ObjectId; planSnapshot?: { name?: string } }>();
  if (current && String(current.planId) === String(plan._id)) {
    return NextResponse.json({ error: "You're already on this plan." }, { status: 409 });
  }

  const existing = await UpgradeRequest.findOne({ userId: ctx.userId, status: "pending" }).lean();
  if (existing) {
    return NextResponse.json({ error: `You already asked for ${existing.toPlanName}. Cancel that request first.` }, { status: 409 });
  }

  const employer = targetRole === "employer"
    ? await Employer.findOne({ userId: ctx.userId }).select("agentId companyName").lean<{ agentId?: mongoose.Types.ObjectId; companyName?: string }>()
    : null;

  const request = await UpgradeRequest.create({
    userId: ctx.userId,
    targetRole,
    fromPlanId: current?.planId,
    fromPlanName: current?.planSnapshot?.name,
    toPlanId: plan._id,
    toPlanName: plan.name,
    toPlanPrice: plan.price,
    toPlanCurrency: plan.currency,
    agentId: employer?.agentId,
    note: body.note,
  });

  const user = await User.findById(ctx.userId).select("name email").lean<{ name?: string; email?: string }>();
  const customerName = employer?.companyName || user?.name || user?.email || "A customer";
  await notifyUpgradeRequested({
    requestId: String(request._id),
    customerName,
    toPlanName: plan.name,
    agentId: employer?.agentId ? String(employer.agentId) : undefined,
  }).catch(() => undefined);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "subscription.upgrade_requested",
    resource: "subscriptions",
    resourceId: String(request._id),
    meta: { toPlan: plan.name, fromPlan: current?.planSnapshot?.name },
    req,
  });

  return NextResponse.json({ request }, { status: 201 });
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  if (customerRole(ctx.role)) {
    const request = await UpgradeRequest.findOne({ userId: ctx.userId, status: "pending" }).lean();
    return NextResponse.json({ request: request ?? null });
  }

  const query = validateQuery(req.nextUrl.searchParams, upgradeRequestListSchema);
  const filter: Record<string, unknown> = query.status === "all" ? {} : { status: query.status };

  // Admin sees everything; agents and super agents only their employers.
  // null = unrestricted (admin); [] = nothing (default-deny).
  const scoped = await getScopedEmployerIds(ctx);
  if (scoped !== null) {
    if (scoped.length === 0) return NextResponse.json({ data: [], page: 1, pageSize: query.pageSize, total: 0, totalPages: 0 });
    const employers = await Employer.find({ _id: { $in: scoped } }).select("userId").lean<{ userId: mongoose.Types.ObjectId }[]>();
    filter.userId = { $in: employers.map((e) => e.userId) };
  }

  const [rows, total] = await Promise.all([
    UpgradeRequest.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .populate("userId", "name email role")
      .lean(),
    UpgradeRequest.countDocuments(filter),
  ]);

  // Company names for employer rows, so the queue reads "Gulf Retail LLC", not a person.
  const employerUserIds = rows
    .filter((r) => r.targetRole === "employer" && r.userId)
    .map((r) => (r.userId as unknown as { _id: mongoose.Types.ObjectId })._id);
  const companies = await Employer.find({ userId: { $in: employerUserIds } })
    .select("userId companyName").lean<{ userId: mongoose.Types.ObjectId; companyName?: string }[]>();
  const companyByUser = new Map(companies.map((c) => [String(c.userId), c.companyName]));

  const data = rows.map((r) => {
    const u = r.userId as unknown as { _id: mongoose.Types.ObjectId; name?: string; email?: string } | null;
    return {
      ...r,
      userId: u?._id ?? null,
      customerName: u ? companyByUser.get(String(u._id)) || u.name || u.email || null : null,
      customerEmail: u?.email ?? null,
    };
  });

  return NextResponse.json({ data, page: query.page, pageSize: query.pageSize, total, totalPages: Math.ceil(total / query.pageSize) });
}

export const POST = withAuth(postHandler, { resource: "subscriptions", action: "read" });
export const GET = withAuth(getHandler, { resource: "subscriptions", action: "read" });
