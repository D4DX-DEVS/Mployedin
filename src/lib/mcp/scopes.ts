import type { UserRole } from "@/types/user";

export type McpScope =
  | "read:jobs"
  | "read:applications"
  | "read:profile"
  | "read:employer_jobs"
  | "read:applicants"
  | "read:insights";

export const MCP_SCOPES: McpScope[] = [
  "read:jobs",
  "read:applications",
  "read:profile",
  "read:employer_jobs",
  "read:applicants",
  "read:insights",
];

/**
 * Scopes a client only receives when it asks for them by name. `read:insights`
 * exposes platform-wide data (every tenant), so an admin connecting a client
 * that omits `scope` must not end up holding it silently.
 */
export const MCP_OPT_IN_SCOPES: McpScope[] = ["read:insights"];

/** Which role each scope is meaningful for — a job seeker can never be granted an employer scope and vice versa. */
export const MCP_SCOPE_ROLES: Record<McpScope, UserRole[]> = {
  "read:jobs": ["job_seeker"],
  "read:applications": ["job_seeker"],
  "read:profile": ["job_seeker"],
  "read:employer_jobs": ["employer", "agent", "super_agent", "admin"],
  "read:applicants": ["employer", "agent", "super_agent", "admin"],
  "read:insights": ["admin"],
};

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  "read:jobs": "Search and view job postings",
  "read:applications": "View your job applications",
  "read:profile": "View your job seeker profile",
  "read:employer_jobs": "View job postings within your assigned role scope",
  "read:applicants": "View applicants within your assigned role scope",
  "read:insights": "Read platform-wide analytics and records (admin AI Data Access)",
};

/** All scopes the current role can hold (including opt-in ones). */
export function allowedScopesForRole(role: UserRole): McpScope[] {
  return MCP_SCOPES.filter((scope) => MCP_SCOPE_ROLES[scope].includes(role));
}

/** Scopes granted when the client omits `scope` — excludes opt-in scopes. */
export function defaultScopesForRole(role: UserRole): McpScope[] {
  return allowedScopesForRole(role).filter((scope) => !MCP_OPT_IN_SCOPES.includes(scope));
}

/**
 * Drop any requested scope that isn't valid for the session's actual role.
 * OAuth clients may omit `scope`; in that case grant the role's documented
 * defaults so the connector cannot complete with a silently unusable token.
 */
export function scopesForRole(requested: string[], role: UserRole): McpScope[] {
  if (requested.length === 0) return defaultScopesForRole(role);
  return requested.filter((s): s is McpScope =>
    MCP_SCOPES.includes(s as McpScope) && MCP_SCOPE_ROLES[s as McpScope].includes(role)
  );
}
