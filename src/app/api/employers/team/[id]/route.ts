import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { teamUpdateSchema } from "@/lib/validators/team";
import { CompanyUser } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canManageTeam, canModifyRole } from "@/lib/permissions/team";

/**
 * PATCH /api/employers/team/[id] — update a team member's role/permissions
 */
async function patchHandler(
  req: NextRequest,
  ctx: { userId: string; role: string },
  params?: Record<string, string>
) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberId = params?.id;
  if (!memberId) {
    return NextResponse.json({ error: "Member ID required" }, { status: 400 });
  }

  const body = await validateBody(req, teamUpdateSchema);

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const callerMember = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.userId,
    status: "active",
  }).lean();

  if (!callerMember || !canManageTeam(callerMember.companyRole)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const target = await CompanyUser.findOne({ _id: memberId, companyId: employer._id });
  if (!target) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  // Cannot modify owner
  if (target.companyRole === "owner") {
    return NextResponse.json({ error: "Cannot modify the owner" }, { status: 403 });
  }

  // Check if caller can modify target's role
  const { companyRole, jobAccess, permissions } = body as {
    companyRole?: string;
    jobAccess?: string[];
    permissions?: Record<string, boolean>;
  };

  if (companyRole && !canModifyRole(callerMember.companyRole, companyRole as "admin" | "hiring_manager" | "viewer")) {
    return NextResponse.json({ error: "Cannot assign this role" }, { status: 403 });
  }

  const before = { companyRole: target.companyRole, jobAccess: target.jobAccess };

  if (companyRole) target.companyRole = companyRole as typeof target.companyRole;
  if (jobAccess !== undefined) target.jobAccess = jobAccess as unknown as typeof target.jobAccess;
  if (permissions) {
    target.permissions = { ...target.permissions, ...permissions } as typeof target.permissions;
  }

  await target.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "team.update_member",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { before, after: { companyRole: target.companyRole, jobAccess: target.jobAccess } },
    req,
  });

  return NextResponse.json({ member: target });
}

/**
 * DELETE /api/employers/team/[id] — deactivate a team member (soft delete)
 */
async function deleteHandler(
  req: NextRequest,
  ctx: { userId: string; role: string },
  params?: Record<string, string>
) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberId = params?.id;
  if (!memberId) {
    return NextResponse.json({ error: "Member ID required" }, { status: 400 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
  }

  const callerMember = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.userId,
    status: "active",
  }).lean();

  if (!callerMember || !canManageTeam(callerMember.companyRole)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const target = await CompanyUser.findOne({ _id: memberId, companyId: employer._id });
  if (!target) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  // Cannot deactivate the owner
  if (target.companyRole === "owner") {
    return NextResponse.json({ error: "Cannot deactivate the owner" }, { status: 403 });
  }

  // Cannot deactivate yourself
  if (target.userId && String(target.userId) === ctx.userId) {
    return NextResponse.json({ error: "Cannot deactivate yourself" }, { status: 400 });
  }

  target.status = "deactivated";
  await target.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "team.deactivate_member",
    resource: "employers",
    resourceId: String(employer._id),
    changes: { after: { email: target.email, status: "deactivated" } },
    req,
  });

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
