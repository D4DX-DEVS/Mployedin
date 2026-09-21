import type { Action, Resource } from "@/types/user";
import { ALL_ACTIONS, ALL_RESOURCES } from "./matrix";

/**
 * The (resource, action) pairs that anything in the app actually checks.
 *
 * `ALL_RESOURCES × ALL_ACTIONS` is 203 combinations, but only the ones listed
 * here reach a real gate: a `withAuth` guard, a CopilotTool / MCP tool
 * definition, a `quickActions` permission block, or a `can()` call in a page.
 * The rest are unreferenced — a custom permission map that omits them changes
 * nothing, because no code ever asks.
 *
 * The permission editor renders from this map rather than from the full
 * product, so every control an admin sees has an effect. Keeping a stale entry
 * here is worse than missing one: it puts a dead switch back on the screen.
 *
 * Maintained by hand and pinned by `src/__tests__/lib/permission-enforcement.test.ts`,
 * which re-derives the same map from the source tree and fails on any drift.
 * When that test fails after you add or remove a guard, update this map — do
 * not weaken the test.
 */
export const ENFORCED_PERMISSIONS: Partial<Record<Resource, Action[]>> = {
  jobs: ["create", "read", "update", "delete"],
  applications: ["create", "read", "update"],
  interviews: ["create", "read", "update", "delete"],
  placements: ["create", "read", "update", "delete"],
  leads: ["create", "read", "update", "delete"],
  commissions: ["create", "read", "update", "delete", "approve"],
  employers: ["create", "read", "update", "delete", "approve"],
  agents: ["create", "read", "update", "delete"],
  job_seekers: ["read", "update", "delete"],
  super_agents: ["create", "update", "delete"],
  users: ["create", "read", "update", "delete", "impersonate"],
  notifications: ["create", "read", "update", "delete"],
  reports: ["read", "export"],
  audit_logs: ["read"],
  tasks: ["create", "read", "update"],
  job_attributes: ["create", "read", "update", "delete"],
  location_data: ["create", "read", "update", "delete"],
  cms: ["create", "read", "update", "delete"],
  contact_submissions: ["read", "update", "delete"],
  offers: ["read", "update"],
  subscriptions: ["create", "read", "update", "delete"],
  exhibitions: ["create", "read", "update", "delete", "approve"],
  resources: ["create", "read", "update", "delete"],
  targets: ["create", "read", "update", "delete"],
  onboarding: ["read", "update"],
  invoices: ["create", "read", "update"],
  // ai_cv, ai_match and ai_assistant are deliberately absent: nothing in the
  // app gates on them today, so the editor would be offering dead controls.
};

/** Resources with at least one enforced action, in `ALL_RESOURCES` order. */
export const ENFORCED_RESOURCES: Resource[] = ALL_RESOURCES.filter(
  (resource) => (ENFORCED_PERMISSIONS[resource]?.length ?? 0) > 0,
);

/** Whether toggling this pair in the editor can change anything at runtime. */
export function isEnforced(resource: Resource, action: Action): boolean {
  return ENFORCED_PERMISSIONS[resource]?.includes(action) ?? false;
}

/** Enforced actions for a resource, in `ALL_ACTIONS` order. */
export function enforcedActionsFor(resource: Resource): Action[] {
  const actions = ENFORCED_PERMISSIONS[resource];
  if (!actions?.length) return [];
  return ALL_ACTIONS.filter((action) => actions.includes(action));
}
