import type { UserRole } from "@/types/user";

/**
 * The MCP connector serves aggregated reports only (owner decision
 * 2026-10-07): totals, breakdowns and trends inside the user's own scope —
 * no records, no names, no contact details, no money figures. One read scope
 * covers it for every role; what the report contains is decided by the role.
 */
export type McpScope = "read:reports";

export const MCP_SCOPES: McpScope[] = ["read:reports"];

export const MCP_SCOPE_ROLES: Record<McpScope, UserRole[]> = {
  "read:reports": ["job_seeker", "employer", "agent", "super_agent", "admin"],
};

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  "read:reports": "View summary reports (totals and trends) for your own account scope",
};

/** All scopes the current role can hold. */
export function defaultScopesForRole(role: UserRole): McpScope[] {
  return MCP_SCOPES.filter((scope) => MCP_SCOPE_ROLES[scope].includes(role));
}

/**
 * Drop any requested scope that isn't valid for the session's actual role.
 * A client may omit `scope`, or still ask for scopes this server no longer
 * offers (the pre-2026-10-07 read:jobs, read:applicants, …); in both cases
 * grant the role's defaults so the connector cannot complete with a silently
 * unusable token.
 */
export function scopesForRole(requested: string[], role: UserRole): McpScope[] {
  const valid = requested.filter((s): s is McpScope =>
    MCP_SCOPES.includes(s as McpScope) && MCP_SCOPE_ROLES[s as McpScope].includes(role)
  );
  return valid.length > 0 ? valid : defaultScopesForRole(role);
}
