import type { UserRole } from "@/models/User";

/** Resources in the system */
export type Resource =
  | "jobs"
  | "applications"
  | "interviews"
  | "placements"
  | "leads"
  | "commissions"
  | "employers"
  | "agents"
  | "job_seekers"
  | "super_agents"
  | "users"
  | "territories"
  | "notifications"
  | "reports"
  | "audit_logs"
  | "ai_cv"
  | "ai_match"
  | "ai_assistant"
  | "tasks"
  | "design_system";

/** Actions on resources */
export type Action =
  | "create"
  | "read"
  | "update"
  | "delete"
  | "approve"
  | "export"
  | "impersonate";

type PermissionMap = Record<Resource, Action[]>;

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
    territories: ["create", "read", "update", "delete"],
    notifications: ["create", "read", "update", "delete"],
    reports: ["read", "export"],
    audit_logs: ["read", "export"],
    ai_cv: ["read"],
    ai_match: ["read"],
    ai_assistant: ["read"],
    tasks: ["read", "update"],
    design_system: ["read"],
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
    territories: ["read"],
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

export function canAccess(
  role: UserRole,
  resource: Resource,
  action: Action
): boolean {
  const perms = PERMISSIONS[role];
  if (!perms) return false;
  const actions = perms[resource];
  if (!actions) return false;
  return actions.includes(action);
}

export function getPermissions(role: UserRole): Partial<PermissionMap> {
  return PERMISSIONS[role] ?? {};
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
