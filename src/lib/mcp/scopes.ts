import type { UserRole } from "@/types/user";

/**
 * What the MCP connector may do.
 *
 * - read:reports — aggregated reports (owner decision 2026-10-07): totals,
 *   breakdowns and trends inside the user's own scope; no names, contacts or money.
 * - read:jobs — the latest jobs the user can already see, with only the fields
 *   the public job page shows (2026-11 poster plan).
 * - write:posters — save free brand posters for those jobs (admin: any job,
 *   employer: their own). No AI credits, nothing published anywhere.
 */
export type McpScope = "read:reports" | "read:jobs" | "write:posters";

export const MCP_SCOPES: McpScope[] = ["read:reports", "read:jobs", "write:posters"];

export const MCP_SCOPE_ROLES: Record<McpScope, UserRole[]> = {
  "read:reports": ["job_seeker", "employer", "agent", "super_agent", "admin"],
  "read:jobs": ["employer", "agent", "super_agent", "admin"],
  "write:posters": ["employer", "admin"],
};

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  "read:reports": "View summary reports (totals and trends) for your own account scope",
  "read:jobs": "See the latest jobs you can already see in Mployedin",
  "write:posters": "Make job posters for jobs you manage",
};

/** All scopes the current role can hold. */
export function defaultScopesForRole(role: UserRole): McpScope[] {
  return MCP_SCOPES.filter((scope) => MCP_SCOPE_ROLES[scope].includes(role));
}

/**
 * The scopes a sign-in grants: everything the session's actual role may hold.
 *
 * The requested list is not trusted to narrow it: clients send stale lists
 * (only read:reports from before 2026-11, or retired names like
 * read:applicants), and a token missing a tool's scope leaves that tool
 * silently unusable. The consent page lists exactly what is granted, and the
 * role, not the request, bounds it. `requested` is kept for the call shape.
 */
export function scopesForRole(_requested: string[], role: UserRole): McpScope[] {
  return defaultScopesForRole(role);
}
