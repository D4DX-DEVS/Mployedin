import type { ResolvedTaskLinks } from "./links";

/**
 * Where each record linked to a task opens — the page the agent acts on it
 * from, not a read-only profile:
 *  - candidate: their application to the linked job (status, interview, offer
 *    and reject live on that row), else all their applications to the agent's
 *    jobs, else their row in Job Seekers
 *  - job: the agent's job page (applicants, matches, manage as employer)
 *  - employer: that employer's jobs
 * A deleted job has no page to open, so it gets no link.
 */
export interface TaskLinkHrefs {
  candidate?: string;
  job?: string;
  employer?: string;
}

export function taskLinkHrefs(locale: string, links: ResolvedTaskLinks | undefined): TaskLinkHrefs {
  if (!links) return {};
  const base = `/${locale}/agent`;
  const out: TaskLinkHrefs = {};
  const { candidate, job, employer } = links;
  if (candidate) {
    out.candidate = candidate.applicationId
      ? `${base}/candidates?applicationId=${candidate.applicationId}`
      : candidate.hasApplications
        ? `${base}/candidates?jobSeekerId=${candidate.id}`
        : `${base}/job-seekers?${new URLSearchParams({ search: candidate.name })}`;
  }
  if (job && !job.deleted) out.job = `${base}/jobs/${job.id}`;
  if (employer) out.employer = `${base}/jobs?employerId=${employer.id}`;
  return out;
}
