export type UserRole =
  | "admin"
  | "super_agent"
  | "agent"
  | "employer"
  | "job_seeker";

export type PermissionMode = "role_default" | "custom";

export type Resource =
  | "jobs" | "applications" | "interviews" | "placements" | "leads"
  | "commissions" | "employers" | "agents" | "job_seekers" | "super_agents"
  | "users" | "notifications" | "reports" | "audit_logs"
  | "ai_cv" | "ai_match" | "ai_assistant" | "tasks"
  | "job_attributes" | "location_data" | "cms" | "contact_submissions"
  | "offers" | "subscriptions" | "exhibitions" | "resources" | "targets"
  | "onboarding" | "invoices";

export type Action = "create" | "read" | "update" | "delete" | "approve" | "export" | "impersonate";

/** Per-user custom permission overrides: resource → allowed actions */
export type CustomPermissions = Partial<Record<Resource, Action[]>>;
