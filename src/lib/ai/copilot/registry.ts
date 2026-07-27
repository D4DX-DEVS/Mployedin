import { canAccess } from "@/lib/permissions/matrix";
import type { UserRole, PermissionMode, CustomPermissions } from "@/types/user";
import { jobSeekerTools } from "./tools/jobSeeker";
import { employerTools } from "./tools/employer";
import { agentTools } from "./tools/agent";
import { superAgentTools } from "./tools/superAgent";
import { adminTools } from "./tools/admin";
import { sharedTools } from "./tools/shared";
import { jobCreationTools } from "./tools/jobCreation";
import type { CopilotTool } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const ALL_TOOLS: CopilotTool<any>[] = [
  ...jobSeekerTools,
  ...employerTools,
  ...agentTools,
  ...superAgentTools,
  ...adminTools,
  ...sharedTools,
  ...jobCreationTools,
];

/**
 * Resolve the tools a given user is allowed to see/call.
 *
 * Double-gated: the permission matrix (canAccess — respects custom per-user
 * overrides) AND the tool's own `roles` allowlist (for tools that are
 * role-specific by nature even though the matrix alone would technically
 * allow them, e.g. approve_job intentionally excludes employer/job_seeker).
 * A tool the model can't see is a tool it can never call — this is the
 * primary safety boundary, re-checked again at execute time.
 */
export function getToolsForUser(
  role: UserRole,
  permissionMode: PermissionMode,
  customPermissions?: CustomPermissions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): CopilotTool<any>[] {
  return ALL_TOOLS.filter((tool) => {
    if (tool.roles && !tool.roles.includes(role)) return false;
    return canAccess(role, tool.resource, tool.action, { permissionMode, customPermissions });
  });
}

export function getToolByName(name: string) {
  return ALL_TOOLS.find((t) => t.name === name);
}
