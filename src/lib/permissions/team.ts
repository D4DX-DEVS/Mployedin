/**
 * Team-specific permission checks for multi-user employer accounts.
 */

import { connectDB } from "@/lib/db/mongoose";
import { CompanyUser } from "@/models/CompanyUser";
import type { CompanyRole, ICompanyUser } from "@/models/CompanyUser";

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
  return companyRole !== "viewer";
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
  if (actorRole === "admin" && (targetRole === "hiring_manager" || targetRole === "viewer")) return true;
  return false;
}
