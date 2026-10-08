import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import User from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { employerAdminUpdateSchema } from "@/lib/validators/employers";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";
import { buildEmployerAdminUpdatePayload } from "@/lib/employers/admin";
import { deactivateEmployerAccount } from "@/lib/employers/accountStatus";
import type { AuthContext } from "@/lib/auth/withAuth";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
  member?: AuthContext["member"];
  tenantView?: AuthContext["tenantView"];
}

/**
 * This route edits the owner's User document. For a colleague or a tenant-view
 * actor, withAuth has swapped ctx.userId to the owner, so the "own account"
 * check passes for someone who is not the owner — and a login-email change
 * here is account takeover. Only the owner themselves, an assigned agent or an
 * admin act through this route.
 */
function actingForSomeoneElse(ctx: AuthCtx): boolean {
  return Boolean(ctx.member || ctx.tenantView);
}

async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();

  // H3: object-level authz. Employers may only read their own account; agents only
  // employers assigned to them. Admin/super_agent retain oversight read access.
  if (ctx.role === "employer" && ctx.userId !== params?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    if (!agent?.assignedEmployerIds?.map(String).includes(params!.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }
  if (ctx.role === "super_agent") {
    // S1: scope super_agent to employers whose assigned agent is within their book of
    // business. No platform-wide PII read.
    const { Employer } = await import("@/models/Employer");
    const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
    const empProfile = await Employer.findOne({ userId: params?.id }).select("agentId").lean();
    const scope = await getSuperAgentScope(ctx.userId);
    const inScope = Boolean(
      empProfile?.agentId && scope?.effectiveAgentIds.some((id) => String(id) === String(empProfile.agentId))
    );
    if (!inScope) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const user = await User.findById(params?.id).select("-passwordHash").lean();
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  return NextResponse.json({ employer: user });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (actingForSomeoneElse(ctx)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const user = await User.findById(params?.id);
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  // IDOR: agents can only update employers assigned to them
  if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("assignedEmployerIds").lean();
    if (!agent?.assignedEmployerIds?.map(String).includes(params!.id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (ctx.role === "employer" && ctx.userId !== params?.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await validateBody(req, employerAdminUpdateSchema);
  // A direct login-email change skips the verified email-change flow, so it is
  // an administrator's tool only. Everyone else uses /api/user/email-change.
  if (body.email !== undefined && ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Email changes must go through email verification", code: "EMAIL_CHANGE_REQUIRES_VERIFICATION" },
      { status: 403 },
    );
  }
  const payload = buildEmployerAdminUpdatePayload(body);

  const userUpdate = payload.userUpdate;
  if (Object.keys(userUpdate).length > 0) {
    Object.assign(user, userUpdate);
    await user.save();
  }

  const employer = await (await import("@/models/Employer")).default.findOne({ userId: user._id });
  if (employer) {
    const employerUpdate = payload.employerUpdate;
    if (Object.keys(employerUpdate).length > 0) {
      Object.assign(employer, employerUpdate);
      await employer.save();
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.update",
    resource: "employers",
    resourceId: params?.id,
    changes: { after: { ...userUpdate, ...payload.employerUpdate } },
    req,
  });

  return NextResponse.json({ employer: user });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (actingForSomeoneElse(ctx)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();
  const user = await User.findById(params?.id);
  if (!user) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

  // Employers may only soft-deactivate their OWN account. Hard deletion
  // (cascade) stays admin-only.
  if (ctx.role === "employer") {
    if (ctx.userId !== params?.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (permanent) {
      return NextResponse.json({ error: "Permanent deletion requires an administrator" }, { status: 403 });
    }
  }

  if (permanent) {
    const { Employer } = await import("@/models/Employer");
    const { cascadeDeleteEmployer } = await import("@/lib/db/cascade");
    const cascade = await cascadeDeleteEmployer(user._id);
    await Employer.deleteOne({ userId: user._id });
    await user.deleteOne();
    await logActivity({
      ...actorFromCtx(ctx),
      action: "employer.delete",
      resource: "employers",
      resourceId: params?.id,
      meta: { cascade },
      req,
    });
    return NextResponse.json({ message: "Employer permanently deleted", cascade });
  }

  user.isActive = false;
  await user.save();
  // Take the company's live jobs off the market too (restored on reactivation).
  await deactivateEmployerAccount(user._id);

  await logActivity({
    ...actorFromCtx(ctx),
    action: "employer.deactivate",
    resource: "employers",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Employer deactivated" });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "delete" });
