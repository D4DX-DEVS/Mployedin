import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { CompanyUser, computeEffectivePermissions } from "@/models/CompanyUser";
import type { CompanyRole, ICompanyUserPermissions } from "@/models/CompanyUser";
import { ensureEmployerOwnerMembership } from "@/lib/employers/company-membership";

export interface CompanyContext {
  companyId: string;
  /** The user id of the employer who owns the company, never the member's own. */
  companyOwnerUserId: string;
  companyUserRole: CompanyRole;
  companyRoles: CompanyRole[];
  permissions: ICompanyUserPermissions;
  jobAccess: string[];
}

/**
 * Work out which company workspace a signed-in employer belongs to.
 *
 * Two shapes exist. A person who owns an Employer document is the owner of
 * their own company, as before. A person with no Employer document may still
 * be an active CompanyUser of somebody else's company; they borrow that
 * workspace, so we resolve the owner's user id here and `withAuth` swaps it in.
 *
 * The `status: "active"` filter matters. Without it a deactivated colleague
 * still resolved a companyId and kept their access.
 */
export async function resolveCompanyContext(userId: string): Promise<CompanyContext | null> {
  await connectDB();

  const employer = await Employer.findOne({ userId }).select("_id companyEmail").lean();
  if (employer) {
    const member = await ensureEmployerOwnerMembership({
      companyId: employer._id,
      userId,
      email: (employer as { companyEmail?: string }).companyEmail,
    });
    const role = (member?.companyRole ?? "owner") as CompanyRole;
    return {
      companyId: String(employer._id),
      companyOwnerUserId: userId,
      companyUserRole: role,
      companyRoles: [role],
      permissions: computeEffectivePermissions([role]),
      jobAccess: [],
    };
  }

  const membership = await CompanyUser.findOne({ userId, status: "active" })
    .select("companyId companyRole companyRoles permissionOverrides jobAccess")
    .lean();
  if (!membership) return null;

  const owner = await Employer.findById(membership.companyId).select("userId").lean();
  if (!owner?.userId) return null;

  const roles = (membership.companyRoles?.length
    ? membership.companyRoles
    : [membership.companyRole]) as CompanyRole[];

  return {
    companyId: String(membership.companyId),
    companyOwnerUserId: String(owner.userId),
    companyUserRole: membership.companyRole as CompanyRole,
    companyRoles: roles,
    permissions: computeEffectivePermissions(roles, membership.permissionOverrides),
    jobAccess: (membership.jobAccess ?? []).map(String),
  };
}
