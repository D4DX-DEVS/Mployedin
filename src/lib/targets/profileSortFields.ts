/**
 * Columns the admin Target Management list can sort by. Shared by the page
 * (URL whitelist) and /api/admin/target-profiles (comparators), so the two
 * cannot drift. An empty sort keeps newest profiles first.
 */
export const TARGET_PROFILE_SORT_FIELDS = [
  "name",
  "teamSize",
  "employerProgress",
  "employeeProgress",
  "financeProgress",
  "overallProgress",
  "risk",
] as const;

export type TargetProfileSortField = (typeof TARGET_PROFILE_SORT_FIELDS)[number];
