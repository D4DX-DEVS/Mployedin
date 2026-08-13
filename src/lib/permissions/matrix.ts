import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
export type { Resource, Action };

type PermissionMap = Record<Resource, Action[]>;

/** All available resources — useful for building the permission editor UI */
export const ALL_RESOURCES: Resource[] = [
  "jobs", "applications", "interviews", "placements", "leads",
  "commissions", "employers", "agents", "job_seekers", "super_agents",
  "users", "notifications", "reports", "audit_logs",
  "ai_cv", "ai_match", "ai_assistant", "tasks",
  "job_attributes", "location_data", "cms", "contact_submissions", "offers",
  "subscriptions", "exhibitions", "resources", "targets", "onboarding",
  "invoices",
];

/** All available actions */
export const ALL_ACTIONS: Action[] = [
  "create", "read", "update", "delete", "approve", "export", "impersonate",
];

const PERMISSIONS: Record<UserRole, Partial<PermissionMap>> = {
  admin: {
    jobs: ["create", "read", "update", "delete", "approve", "export"],
    applications: ["create", "read", "update", "delete", "export"],
    interviews: ["create", "read", "update", "delete"],
    placements: ["create", "read", "update", "delete", "export"],
    leads: ["create", "read", "update", "delete", "export"],
    commissions: ["create", "read", "update", "delete", "approve", "export"],
    employers: ["create", "read", "update", "delete", "approve"],
    agents: ["create", "read", "update", "delete"],
    job_seekers: ["create", "read", "update", "delete"],
    super_agents: ["create", "read", "update", "delete"],
    users: ["create", "read", "update", "delete", "impersonate"],
    notifications: ["create", "read", "update", "delete"],
    reports: ["read", "export"],
    audit_logs: ["read", "export"],
    ai_cv: ["read"],
    ai_match: ["read"],
    ai_assistant: ["read"],
    tasks: ["read", "update"],
    job_attributes: ["create", "read", "update", "delete"],
    location_data: ["create", "read", "update", "delete"],
    cms: ["create", "read", "update", "delete"],
    contact_submissions: ["read", "update", "delete"],
    offers: ["create", "read", "update", "delete"],
    subscriptions: ["create", "read", "update", "delete", "export"],
    exhibitions: ["create", "read", "update", "delete", "approve"],
    resources: ["create", "read", "update", "delete"],
    targets: ["create", "read", "update", "delete", "export"],
    onboarding: ["create", "read", "update", "delete"],
    invoices: ["create", "read", "update", "delete", "export"],
  },
  super_agent: {
    jobs: ["read", "approve", "export"],
    applications: ["read", "export"],
    interviews: ["read"],
    placements: ["read", "export"],
    leads: ["create", "read", "update", "delete", "export"],
    commissions: ["read", "approve", "export"],
    employers: ["create", "read"],
    agents: ["create", "read", "update"],
    job_seekers: ["read"],
    notifications: ["read"],
    reports: ["read", "export"],
    ai_assistant: ["read"],
    subscriptions: ["create", "read", "update"],
    // "update" is what PATCH /api/exhibitions/[id] guards on, and that route is
    // the only implementation of the super-agent review flow (status transitions,
    // budget notes) driven by super-agent/exhibitions/page.tsx:206. Without it the
    // entire approval workflow 403'd. Team jurisdiction is enforced in-handler.
    exhibitions: ["read", "update", "approve"],
    resources: ["read"],
    targets: ["create", "read", "update"],
    // Read-only oversight of offers across the portfolio.
    offers: ["read"],
    invoices: ["create", "read", "update"],
  },
  agent: {
    // "approve" mirrors POST /api/admin/jobs/[id]/approve — agents may approve
    // jobs they own or whose employer they manage (route enforces ownership).
    jobs: ["create", "read", "update", "export", "approve"],
    applications: ["read", "update", "export"],
    interviews: ["create", "read", "update"],
    placements: ["read"],
    // "delete" covers the Trash action on the agent leads page; the route
    // (leads/[id]:139 via verifyLeadAccess) restricts it to the agent's own
    // leads. Without it that button 403'd, and POST /api/leads/bulk already
    // hard-deleted the same rows under its leads:update guard.
    leads: ["create", "read", "update", "delete"],
    commissions: ["read"],
    employers: ["create", "read", "update"],
    job_seekers: ["read", "update"],
    notifications: ["read"],
    reports: ["read"],
    ai_cv: ["read"],
    ai_match: ["read"],
    ai_assistant: ["read"],
    subscriptions: ["create", "read"],
    // "update"/"delete" are needed for the agent's own exhibition request: PATCH
    // and DELETE /api/exhibitions/[id] (agent/exhibitions/page.tsx:351,387). The
    // handler restricts both to item.agentId === self and to draft/submitted/
    // revision_requested states, so this is not broader than the UI implies.
    exhibitions: ["create", "read", "update", "delete"],
    resources: ["read"],
    targets: ["read"],
    // Agents create/manage offers on behalf of their assigned employers; the
    // route handlers enforce assigned-employer ownership.
    offers: ["create", "read", "update", "delete"],
    invoices: ["create", "read"],
  },
  employer: {
    jobs: ["create", "read", "update", "delete"],
    applications: ["read", "update"],
    interviews: ["create", "read", "update"],
    placements: ["read", "update"],
    // "delete" here is self-deactivation only — the route handler restricts
    // employers to soft-deactivating their own account.
    employers: ["read", "update", "delete"],
    job_seekers: ["read"],
    notifications: ["read"],
    ai_assistant: ["read"],
    offers: ["create", "read", "update", "delete"],
    subscriptions: ["read"],
    invoices: ["read"],
    // Employer manages the post-hire onboarding workspace for their placements;
    // the route handlers enforce placement ownership.
    onboarding: ["read", "update"],
  },
  job_seeker: {
    jobs: ["read"],
    applications: ["create", "read", "update"],
    interviews: ["read"],
    job_seekers: ["read", "update"],
    notifications: ["read"],
    ai_cv: ["read"],
    ai_match: ["read"],
    ai_assistant: ["read"],
    // Job seekers respond to (accept/decline) their own offers; the route
    // handler enforces ownership and only permits status responses.
    offers: ["read", "update"],
    subscriptions: ["read"],
    invoices: ["read"],
    // Hired candidates view their onboarding and upload/sign requested
    // documents; the route handler enforces ownership of the placement.
    onboarding: ["read", "update"],
  },
};

/**
 * Check if a user can access a resource/action.
 * Supports both role-based (default) and custom per-user permissions.
 */
export function canAccess(
  role: UserRole,
  resource: Resource,
  action: Action,
  opts?: { permissionMode?: PermissionMode; customPermissions?: CustomPermissions }
): boolean {
  // Custom permissions may only RESTRICT the role, never extend it. This used to
  // return from the custom map alone, ignoring the role entirely, so a custom map
  // could grant a job_seeker employer- or admin-level actions — and three accounts in
  // the database were provisioned exactly that way. The permission editor pre-fills
  // from getDefaultPermissionsForRole(), so narrowing is the intended use;
  // cross-role elevation should go through changing the user's role.
  if (opts?.permissionMode === "custom" && opts.customPermissions) {
    const customActions = opts.customPermissions[resource];
    if (!customActions?.includes(action)) return false;
    const roleActions = PERMISSIONS[role]?.[resource];
    return Boolean(roleActions?.includes(action));
  }

  // Default: role-based permission check
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  const actions = perms[resource];
  if (!actions) return false;
  return actions.includes(action);
}

/** Get the default permission map for a role */
export function getPermissions(role: UserRole): Partial<PermissionMap> {
  return PERMISSIONS[role] ?? {};
}

/** Get a deep copy of default permissions for a role (for pre-filling permission editor) */
export function getDefaultPermissionsForRole(role: UserRole): CustomPermissions {
  const perms = PERMISSIONS[role] ?? {};
  const copy: CustomPermissions = {};
  for (const [key, actions] of Object.entries(perms)) {
    copy[key as Resource] = [...(actions as Action[])];
  }
  return copy;
}

/** Dashboard redirect based on role */
export function getDashboardPath(role: UserRole, locale = "en"): string {
  const paths: Record<UserRole, string> = {
    admin: `/${locale}/admin`,
    super_agent: `/${locale}/super-agent`,
    agent: `/${locale}/agent`,
    employer: `/${locale}/employer`,
    job_seeker: `/${locale}/job-seeker`,
  };
  return paths[role] ?? `/${locale}/job-seeker`;
}
