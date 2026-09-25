/**
 * Team-specific permission checks for multi-user employer accounts.
 */

import { connectDB } from "@/lib/db/mongoose";
import { CompanyUser } from "@/models/CompanyUser";
import type { CompanyRole, ICompanyUser } from "@/models/CompanyUser";
import { ensureEmployerOwnerMembership } from "@/lib/employers/company-membership";

/**
 * Get a user's team membership for a given company.
 * Returns null if the user is not an active member.
 */
export async function getTeamMember(
  userId: string,
  companyId: string
): Promise<ICompanyUser | null> {
  await connectDB();
  return CompanyUser.findOne({
    companyId,
    userId,
    status: "active",
  }).lean();
}

/**
 * The person actually making the request inside an employer company.
 *
 * withAuth swaps `ctx.userId` to the company OWNER for a colleague, so that
 * every `Employer.findOne({ userId: ctx.userId })` resolves the company. The
 * colleague themselves is `ctx.member.actorId`. Any check of the caller's own
 * team role or job access must use this id — keyed on `ctx.userId` it finds the
 * owner's row and a colleague is evaluated as the owner.
 */
export function actingUserId(ctx: { userId: string; member?: { actorId: string } }): string {
  return ctx.member?.actorId ?? ctx.userId;
}

/**
 * Job ids a colleague is confined to, or `null` when the caller may see every
 * job of the company (owner, tenant view, admin role, or an empty jobAccess).
 * A colleague whose membership is no longer active gets `[]` — no jobs.
 */
export async function getMemberJobRestriction(
  ctx: { userId: string; member?: { actorId: string } },
  companyId: unknown
): Promise<string[] | null> {
  if (!ctx.member) return null;
  await connectDB();
  const member = await CompanyUser.findOne({
    companyId,
    userId: ctx.member.actorId,
    status: "active",
  })
    .select("companyRole companyRoles jobAccess")
    .lean();
  if (!member) return [];
  const roles: CompanyRole[] = member.companyRoles?.length ? member.companyRoles : [member.companyRole];
  if (roles.some((r) => r === "owner" || r === "admin")) return null;
  if (!member.jobAccess || member.jobAccess.length === 0) return null;
  return member.jobAccess.map(String);
}

/**
 * Whether a colleague's job restriction lets them reach this job. Always true
 * for the owner, tenant view and unrestricted colleagues.
 */
export async function memberMayAccessJob(
  ctx: { userId: string; member?: { actorId: string } },
  companyId: unknown,
  jobId: unknown
): Promise<boolean> {
  const restriction = await getMemberJobRestriction(ctx, companyId);
  return restriction === null || restriction.includes(String(jobId));
}

/**
 * The role whose authority the caller manages the team with, or null when they
 * may not manage it at all.
 *
 * The owner (and a tenant-view session) is judged on the owner's own row,
 * backfilled if missing. A colleague is judged on their OWN live row: withAuth
 * points `ctx.userId` at the owner, so looking a colleague up by it let anyone
 * holding the team function act as the owner. A colleague granted the team
 * function without an owner/admin role is capped at "admin" — they manage the
 * lower roles and can never create or change an admin.
 */
export async function getTeamActorRole(
  ctx: { userId: string; member?: { actorId: string } },
  employer: { _id: unknown; companyEmail?: string | null }
): Promise<CompanyRole | null> {
  await connectDB();
  if (!ctx.member) {
    const owner = await ensureEmployerOwnerMembership({
      companyId: employer._id,
      userId: ctx.userId,
      email: employer.companyEmail,
    });
    return owner && canManageTeam(owner.companyRole) ? owner.companyRole : null;
  }
  const row = await CompanyUser.findOne({
    companyId: employer._id,
    userId: ctx.member.actorId,
    status: "active",
  })
    .select("companyRole companyRoles permissions")
    .lean();
  if (!row) return null;
  const roles = row.companyRoles?.length ? row.companyRoles : [row.companyRole];
  if (roles.includes("owner")) return "owner";
  if (roles.includes("admin") || row.permissions?.canManageTeam) return "admin";
  return null;
}

/**
 * Whether `actorRole` may change or deactivate a member who currently holds
 * `targetRoles` — every one of them must be a role the actor may assign, so an
 * admin cannot demote or remove another admin.
 */
export function canModifyMember(actorRole: CompanyRole, targetRoles: CompanyRole[]): boolean {
  return targetRoles.every((r) => canModifyRole(actorRole, r));
}

/**
 * Get all companies a user is an active member of.
 */
export async function getUserCompanies(userId: string): Promise<ICompanyUser[]> {
  await connectDB();
  return CompanyUser.find({ userId, status: "active" }).lean();
}

/**
 * Check if a user can manage team members (owner or admin only).
 */
export function canManageTeam(companyRole: CompanyRole): boolean {
  return companyRole === "owner" || companyRole === "admin";
}

/**
 * Check if a team member can access a specific job.
 * Owners/admins have access to all jobs. Hiring managers are restricted
 * to their jobAccess array. Viewers follow the same rule as hiring managers.
 */
export function canAccessJob(
  member: Pick<ICompanyUser, "companyRole" | "jobAccess">,
  jobId: string
): boolean {
  if (member.companyRole === "owner" || member.companyRole === "admin") return true;
  if (!member.jobAccess || member.jobAccess.length === 0) return true; // empty = all jobs
  return member.jobAccess.some((id) => String(id) === jobId);
}

/**
 * Check if a team role allows write operations.
 */
export function canWrite(companyRole: CompanyRole): boolean {
  return companyRole !== "viewer" && companyRole !== "finance_viewer";
}

/**
 * Roles that a given role can invite / modify.
 * - owner can do anything
 * - admin can invite/modify hiring_manager, viewer
 * - hiring_manager / viewer cannot invite
 */
export function canModifyRole(
  actorRole: CompanyRole,
  targetRole: CompanyRole
): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin" && (targetRole === "hiring_manager" || targetRole === "accounting" || targetRole === "finance_viewer" || targetRole === "viewer")) return true;
  return false;
}
