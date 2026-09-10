/**
 * Company roles, permission flags, and the pure logic that turns roles plus an
 * employer's manual ticks into an effective permission set.
 *
 * Deliberately free of Mongoose. This module is imported by client components
 * (the invite checklist) as well as by API routes, and importing the model
 * there pulls mongoose — and Node built-ins like `net` and `child_process` —
 * into the browser bundle, which fails the build. `@/models/CompanyUser`
 * re-exports everything here, so server-side imports need not change.
 */

export type CompanyRole = "owner" | "admin" | "hiring_manager" | "accounting" | "finance_viewer" | "viewer";
export type CompanyUserStatus = "pending" | "active" | "deactivated";

export interface ICompanyUserPermissions {
  canCreateJobs: boolean;
  canManageTeam: boolean;
  canViewAnalytics: boolean;
  canExportData: boolean;
  canManageBilling: boolean;
  canViewReports: boolean;
  canApproveInvoices: boolean;
  canViewCommissions: boolean;
  // Added 2026-09-09 so an employer can hand a colleague named functions
  // rather than a whole role. See the team-members design spec.
  canReviewApplicants: boolean;
  canScheduleInterviews: boolean;
  canSendOffers: boolean;
  canOnboardPlacements: boolean;
  canRunScreening: boolean;
  canManageTalentPools: boolean;
  canManageCompanySettings: boolean;
}

export type PermissionFlag = keyof ICompanyUserPermissions;

/**
 * The flags the invite checklist offers, in the order it shows them. The four
 * legacy flags (canExportData, canViewReports, canApproveInvoices,
 * canViewCommissions) stay role-derived and deliberately stay out of this list.
 */
export const COMPANY_FUNCTIONS: readonly PermissionFlag[] = [
  "canCreateJobs",
  "canReviewApplicants",
  "canScheduleInterviews",
  "canSendOffers",
  "canOnboardPlacements",
  "canRunScreening",
  "canManageTalentPools",
  "canManageBilling",
  "canViewAnalytics",
  "canManageCompanySettings",
  "canManageTeam",
] as const;


const ALL_TRUE: ICompanyUserPermissions = {
  canCreateJobs: true, canManageTeam: true, canViewAnalytics: true,
  canExportData: true, canManageBilling: true, canViewReports: true,
  canApproveInvoices: true, canViewCommissions: true,
  canReviewApplicants: true, canScheduleInterviews: true, canSendOffers: true,
  canOnboardPlacements: true, canRunScreening: true, canManageTalentPools: true,
  canManageCompanySettings: true,
};

const ALL_FALSE: ICompanyUserPermissions = {
  canCreateJobs: false, canManageTeam: false, canViewAnalytics: false,
  canExportData: false, canManageBilling: false, canViewReports: false,
  canApproveInvoices: false, canViewCommissions: false,
  canReviewApplicants: false, canScheduleInterviews: false, canSendOffers: false,
  canOnboardPlacements: false, canRunScreening: false, canManageTalentPools: false,
  canManageCompanySettings: false,
};

const DEFAULT_PERMISSIONS: Record<CompanyRole, ICompanyUserPermissions> = {
  owner: { ...ALL_TRUE },
  admin: { ...ALL_TRUE },
  hiring_manager: {
    ...ALL_FALSE,
    canCreateJobs: true,
    canReviewApplicants: true,
    canScheduleInterviews: true,
    canSendOffers: true,
    canOnboardPlacements: true,
    canRunScreening: true,
  },
  accounting: {
    ...ALL_FALSE,
    canViewAnalytics: true,
    canExportData: true,
    canManageBilling: true,
    canViewReports: true,
    canApproveInvoices: true,
    canViewCommissions: true,
  },
  finance_viewer: {
    ...ALL_FALSE,
    canViewAnalytics: true,
    canViewReports: true,
    canViewCommissions: true,
  },
  viewer: { ...ALL_FALSE },
};

export function getDefaultPermissions(role: CompanyRole): ICompanyUserPermissions {
  return { ...DEFAULT_PERMISSIONS[role] };
}

/** Merge permissions from multiple roles (union — any true wins) */
export function getMergedPermissions(roles: CompanyRole[]): ICompanyUserPermissions {
  const merged: ICompanyUserPermissions = { ...ALL_FALSE };
  for (const role of roles) {
    const perms = DEFAULT_PERMISSIONS[role];
    if (!perms) continue;
    for (const key of Object.keys(merged) as PermissionFlag[]) {
      if (perms[key]) merged[key] = true;
    }
  }
  return merged;
}

/**
 * The permissions a member actually has: the union of their roles, then the
 * employer's manual ticks applied on top. Overrides naming an unknown flag are
 * ignored rather than widening the object with junk.
 */
export function computeEffectivePermissions(
  roles: CompanyRole[],
  overrides?: Partial<Record<PermissionFlag, boolean>> | null
): ICompanyUserPermissions {
  const effective = getMergedPermissions(roles);
  if (!overrides) return effective;
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value !== "boolean") continue;
    // Own-property check, not `key in effective`: `in` walks the prototype
    // chain, so "constructor", "toString" and friends would pass and be written
    // onto the result. Overrides arrive from a request body, so the check has to
    // be against real flags only.
    if (!Object.prototype.hasOwnProperty.call(effective, key)) continue;
    effective[key as PermissionFlag] = value;
  }
  return effective;
}

/** Role priority for determining primary role (highest privilege first) */
const ROLE_PRIORITY: CompanyRole[] = ["owner", "admin", "hiring_manager", "accounting", "finance_viewer", "viewer"];

/** Get the highest-privilege role from an array of roles */
export function getPrimaryRole(roles: CompanyRole[]): CompanyRole {
  for (const r of ROLE_PRIORITY) {
    if (roles.includes(r)) return r;
  }
  return roles[0] ?? "viewer";
}
