import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { teamUpdateSchema } from "@/lib/validators/team";
import { CompanyUser, computeEffectivePermissions, getPrimaryRole } from "@/models/CompanyUser";
import type { CompanyRole, PermissionFlag } from "@/models/CompanyUser";
import { Employer } from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canManageTeam, canModifyRole } from "@/lib/permissions/team";
import { isValidObjectId } from "@/lib/security/sanitize";

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
  if (!isValidObjectId(memberId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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
  const { companyRole, companyRoles, jobAccess, permissionOverrides } = body as {
    companyRole?: CompanyRole;
    companyRoles?: CompanyRole[];
    jobAccess?: string[];
    permissionOverrides?: Partial<Record<PermissionFlag, boolean>>;
  };

  // Both shapes are accepted: the checklist sends the full roles array, older
  // callers send one role.
  const resolvedRoles: CompanyRole[] | undefined =
    companyRoles && companyRoles.length > 0
      ? companyRoles
      : companyRole
        ? [companyRole]
        : undefined;

  if (resolvedRoles) {
    for (const role of resolvedRoles) {
      if (!canModifyRole(callerMember.companyRole, role as "admin" | "hiring_manager" | "accounting" | "finance_viewer" | "viewer")) {
        return NextResponse.json({ error: "Cannot assign this role" }, { status: 403 });
      }
    }
  }

  const before = {
    companyRole: target.companyRole,
    companyRoles: target.companyRoles,
    jobAccess: target.jobAccess,
  };

  if (resolvedRoles) {
    target.companyRole = getPrimaryRole(resolvedRoles);
    target.companyRoles = resolvedRoles;
  }
  if (jobAccess !== undefined) target.jobAccess = jobAccess as unknown as typeof target.jobAccess;
  if (permissionOverrides !== undefined) {
    target.permissionOverrides = permissionOverrides;
  }

  // The stored permission set is always recomputed from roles plus the
  // employer's manual ticks, never written straight from the request. A caller
  // cannot hand us a permission set the role system never agreed to, and a role
  // change can never leave stale permissions behind.
  if (resolvedRoles || permissionOverrides !== undefined) {
    const rolesForCompute = (target.companyRoles?.length ? target.companyRoles : [target.companyRole]) as CompanyRole[];
    target.permissions = computeEffectivePermissions(rolesForCompute, target.permissionOverrides);
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
  if (!isValidObjectId(memberId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
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

export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "delete" });
