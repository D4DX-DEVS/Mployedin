import type { UserRole, PermissionMode, CustomPermissions, Resource, Action } from "@/types/user";
export type { Resource, Action };

type PermissionMap = Record<Resource, Action[]>;

/** All available resources — useful for building the permission editor UI */
export const ALL_RESOURCES: Resource[] = [
  "jobs", "applications", "interviews", "placements", "leads",
  "commissions", "employers", "agents", "job_seekers", "super_agents",
  "users", "notifications", "reports", "audit_logs",
  "ai_cv", "ai_match", "ai_assistant", "tasks", "design_system",
  "job_attributes", "location_data", "cms", "contact_submissions",
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
    design_system: ["read"],
    job_attributes: ["create", "read", "update", "delete"],
    location_data: ["create", "read", "update", "delete"],
    cms: ["create", "read", "update", "delete"],
    contact_submissions: ["read", "update", "delete"],
  },
  super_agent: {
    jobs: ["read", "export"],
    applications: ["read", "export"],
    interviews: ["read"],
    placements: ["read", "export"],
    leads: ["create", "read", "update", "delete", "export"],
    commissions: ["read", "approve", "export"],
    employers: ["read"],
    agents: ["create", "read", "update"],
    job_seekers: ["read"],
    notifications: ["read"],
    reports: ["read", "export"],
    ai_assistant: ["read"],
  },
  agent: {
    jobs: ["create", "read", "update", "export"],
    applications: ["read", "update", "export"],
    interviews: ["create", "read", "update"],
    placements: ["read"],
    leads: ["create", "read", "update"],
    employers: ["create", "read", "update"],
    job_seekers: ["read", "update"],
    notifications: ["read"],
    ai_cv: ["read"],
    ai_match: ["read"],
    ai_assistant: ["read"],
  },
  employer: {
    jobs: ["create", "read", "update"],
    applications: ["read", "update"],
    interviews: ["create", "read", "update"],
    placements: ["read"],
    notifications: ["read"],
    ai_assistant: ["read"],
  },
  job_seeker: {
    jobs: ["read"],
    applications: ["create", "read"],
    interviews: ["read"],
    notifications: ["read"],
    ai_cv: ["read"],
    ai_match: ["read"],
    ai_assistant: ["read"],
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
  // If the user has custom permissions, use those instead of role defaults
  if (opts?.permissionMode === "custom" && opts.customPermissions) {
    const actions = opts.customPermissions[resource];
    if (!actions) return false;
    return actions.includes(action);
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
