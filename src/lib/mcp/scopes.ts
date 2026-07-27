import type { UserRole } from "@/types/user";

export type McpScope =
  | "read:jobs"
  | "read:applications"
  | "read:profile"
  | "read:employer_jobs"
  | "read:applicants";

export const MCP_SCOPES: McpScope[] = [
  "read:jobs",
  "read:applications",
  "read:profile",
  "read:employer_jobs",
  "read:applicants",
];

/** Which role each scope is meaningful for — a job seeker can never be granted an employer scope and vice versa. */
export const MCP_SCOPE_ROLES: Record<McpScope, UserRole[]> = {
  "read:jobs": ["job_seeker"],
  "read:applications": ["job_seeker"],
  "read:profile": ["job_seeker"],
  "read:employer_jobs": ["employer"],
  "read:applicants": ["employer"],
};

export const MCP_SCOPE_DESCRIPTIONS: Record<McpScope, string> = {
  "read:jobs": "Search and view job postings",
  "read:applications": "View your job applications",
  "read:profile": "View your job seeker profile",
  "read:employer_jobs": "View your company's job postings",
  "read:applicants": "View applicants to your job postings",
};

/** Drop any requested scope that isn't valid for the session's actual role. */
export function scopesForRole(requested: string[], role: UserRole): McpScope[] {
  return requested.filter((s): s is McpScope =>
    MCP_SCOPES.includes(s as McpScope) && MCP_SCOPE_ROLES[s as McpScope].includes(role)
  );
}
