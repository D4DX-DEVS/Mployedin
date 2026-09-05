import type { UserRole } from "@/types/user";

/**
 * Where a ⌘K entity hit sends the user, per workspace.
 *
 * A role appears here only when both destinations actually exist for it. Admin
 * has no `jobs/[id]` page either, but its jobs list opens the record itself
 * from `?job=<id>` and its job-seekers list narrows from `?search=`, so both
 * hits land on the record rather than on a table to be searched again. The
 * search API has always scoped admin correctly; this map decides who is asked.
 *
 * `candidate` is the employer's second entity. A seeker searches the same two
 * shapes from the other side of the table — a job, or one of their own
 * applications — so the heading is named per role instead of the palette
 * calling every second-entity hit a candidate.
 */
export interface EntitySearchRoutes {
  job: (id: string) => string;
  candidate: (name: string) => string;
  /** Key into the "commandMenu" namespace for the second group's heading. */
  candidateHeadingKey?: string;
  /** Search-box placeholder key; defaults to the staff wording. */
  placeholderKey?: string;
}

export const ENTITY_SEARCH_ROUTES: Partial<Record<UserRole, EntitySearchRoutes>> = {
  admin: {
    job: (id) => `/admin/jobs?job=${id}`,
    candidate: (name) => `/admin/job-seekers?search=${encodeURIComponent(name)}`,
  },
  // The agent was left out on the grounds that it has no applications list.
  // It does — `/agent/candidates` is that list under another name, and it now
  // reads `?search=`. `/agent/jobs/[id]` has always existed, and the search API
  // already scopes agents through getScopedEmployerIds, so the palette was the
  // only thing standing between an agent and finding a record by name.
  agent: {
    job: (id) => `/agent/jobs/${id}`,
    candidate: (name) => `/agent/candidates?search=${encodeURIComponent(name)}`,
  },
  employer: {
    job: (id) => `/employer/jobs/${id}`,
    candidate: (name) => `/employer/applications?search=${encodeURIComponent(name)}`,
  },
  job_seeker: {
    job: (id) => `/job-seeker/jobs/${id}`,
    candidate: (name) => `/job-seeker/applications?search=${encodeURIComponent(name)}`,
    candidateHeadingKey: "applicationsFound",
    // The default placeholder offers to search candidates. A seeker cannot.
    placeholderKey: "placeholderJobSeeker",
  },
  // A super-agent has no `jobs/[id]` route, which is why this role used to be
  // left out — but its jobs list opens the same record in a detail dialog, and
  // that dialog now takes the id from `?job=`. The applications list reads
  // `?search=`, and the search API has always scoped this role correctly
  // (workspace-search/route.ts resolves it through getScopedEmployerIds), so
  // the palette was the only piece missing.
  super_agent: {
    job: (id) => `/super-agent/jobs?job=${id}`,
    candidate: (name) => `/super-agent/applications?search=${encodeURIComponent(name)}`,
  },
};

export function getEntitySearchRoutes(role: string | undefined): EntitySearchRoutes | null {
  return ENTITY_SEARCH_ROUTES[role as UserRole] ?? null;
}
