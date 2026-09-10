import type { ICompanyUserPermissions, PermissionFlag } from "@/lib/permissions/companyRoles";

/**
 * Which granted function a company member needs to touch each API path.
 *
 * Keyed by path prefix rather than by a single resource-type union, since
 * these route groups (background checks, screening analytics, talent pools,
 * comm templates, posters, matching-weight templates...) don't share one
 * common resource shape.
 *
 * Longest prefix wins: a more specific path must appear before the shorter
 * one it sits under (e.g. `/api/employers/team` before `/api/employers`,
 * since the latter is otherwise gated on `canManageCompanySettings`). A test
 * enforces that ordering.
 *
 * Flags are capability-shaped, not verb-shaped: a colleague who may not run
 * screening may not read screening results either, so GET is gated the same
 * as POST/PATCH/DELETE.
 */
export const MEMBER_ROUTE_FUNCTIONS: ReadonlyArray<readonly [string, PermissionFlag]> = [
  ["/api/employers/team", "canManageTeam"],
  ["/api/employers/activity-history", "canManageTeam"],
  ["/api/employers/analytics", "canViewAnalytics"],
  ["/api/employers/screening-analytics", "canRunScreening"],
  ["/api/employers/candidates", "canManageTalentPools"],
  ["/api/employers/comm-templates", "canManageTalentPools"],
  ["/api/employers/posters", "canManageTalentPools"],
  ["/api/employers/poster-credits", "canManageTalentPools"],
  ["/api/employers/job-templates", "canManageCompanySettings"],
  ["/api/employers/matching-weights", "canViewAnalytics"],
  ["/api/employers/matching-weight-templates", "canViewAnalytics"],
  ["/api/employers/workflow", "canOnboardPlacements"],
  ["/api/employers/workflow-templates", "canOnboardPlacements"],
  ["/api/employers/documents", "canManageCompanySettings"],
  ["/api/employers/logo", "canManageCompanySettings"],
  ["/api/employers/verify-domain", "canManageCompanySettings"],
  ["/api/employers/agents", "canManageCompanySettings"],
  ["/api/employers/saved-views", "canReviewApplicants"],
  ["/api/employers/stats", "canViewAnalytics"],
  ["/api/employers", "canManageCompanySettings"],
  ["/api/employer/background-checks", "canRunScreening"],
  ["/api/employer/applications", "canReviewApplicants"],
  ["/api/employer/talent-search", "canManageTalentPools"],
  ["/api/employer/payment-config", "canManageBilling"],
  ["/api/assessments", "canRunScreening"],
  ["/api/scorecards", "canRunScreening"],
  ["/api/talent-pools", "canManageTalentPools"],
  ["/api/email-sequences", "canManageTalentPools"],
  ["/api/jobs", "canCreateJobs"],
  ["/api/applications", "canReviewApplicants"],
  ["/api/application-forms", "canReviewApplicants"],
  ["/api/application-feedback", "canReviewApplicants"],
  ["/api/interviews", "canScheduleInterviews"],
  ["/api/calendar", "canScheduleInterviews"],
  ["/api/offers", "canSendOffers"],
  ["/api/offer-letters", "canSendOffers"],
  ["/api/hiring-decisions", "canSendOffers"],
  ["/api/placements", "canOnboardPlacements"],
  ["/api/requisitions", "canCreateJobs"],
  ["/api/approval-workflows", "canOnboardPlacements"],
  ["/api/invoices", "canManageBilling"],
  ["/api/subscriptions", "canManageBilling"],
  ["/api/payments", "canManageBilling"],
  ["/api/commissions", "canManageBilling"],
] as const;

/**
 * Paths every signed-in company member reaches whatever functions they were
 * granted. Keep this list short: anything not here and not in the map above
 * is refused.
 *
 * `/api/employers/me` and `/api/employers/setup-status` are load-bearing: the
 * employer app shell and layout call them on every page. They must be (and
 * are, in `memberCanAccessPath` below) checked before the longest-prefix map,
 * or a member without `canManageCompanySettings` would be refused by the
 * `/api/employers` entry and lose the whole workspace shell.
 */
export const MEMBER_ALWAYS_ALLOWED: readonly string[] = [
  "/api/auth",
  "/api/notifications",
  "/api/messages",
  "/api/dm",
  "/api/workspace-search",
  "/api/user",
  "/api/settings",
  "/api/dashboard",
  "/api/countries",
  "/api/taxonomy",
  "/api/filters",
  "/api/health",
  "/api/employers/me",
  "/api/employers/setup-status",
] as const;

function matchLongestPrefix(pathname: string): PermissionFlag | null {
  let best: { length: number; flag: PermissionFlag } | null = null;
  for (const [prefix, flag] of MEMBER_ROUTE_FUNCTIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.length) best = { length: prefix.length, flag };
    }
  }
  return best?.flag ?? null;
}

/**
 * Default deny. A company member reaches a path only when it is universally
 * allowed, or it is mapped and they hold the mapped flag. An unmapped
 * employer route refuses rather than leaking, which is the failure direction
 * this codebase has been bitten by before.
 */
export function memberCanAccessPath(
  pathname: string,
  permissions: ICompanyUserPermissions
): boolean {
  for (const prefix of MEMBER_ALWAYS_ALLOWED) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return true;
  }
  const flag = matchLongestPrefix(pathname);
  if (!flag) return false;
  return permissions[flag] === true;
}
