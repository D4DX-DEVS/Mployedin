"use client";

import { useParams, usePathname, useSearchParams } from "next/navigation";

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export type JobPostingRole = "employer" | "agent";

export interface JobPostingTarget {
  role: JobPostingRole;
  /** `/{locale}/{role}/jobs` — where every job-creation flow starts and ends. */
  jobsHref: string;
  /** The employer an agent is posting for (`?employer=`); never set for an employer. */
  employerId?: string;
  /** Carry the agent's employer onto the next page; unchanged for an employer. */
  withEmployer: (href: string) => string;
}

/**
 * The job-creation pages (AI creator, document upload, template picker) are
 * shared by the employer and the agent. An employer posts for their own
 * company; an agent posts for an assigned employer picked on the start screen,
 * carried page to page as `?employer=`.
 */
export function jobPostingTarget(pathname: string, locale: string, employerParam: string | null): JobPostingTarget {
  const role: JobPostingRole = pathname.split("/")[2] === "agent" ? "agent" : "employer";
  const employerId = role === "agent" && employerParam && OBJECT_ID.test(employerParam) ? employerParam : undefined;
  return {
    role,
    jobsHref: `/${locale}/${role}/jobs`,
    employerId,
    withEmployer: (href) =>
      employerId ? `${href}${href.includes("?") ? "&" : "?"}employer=${employerId}` : href,
  };
}

export function useJobPostingTarget(): JobPostingTarget {
  const { locale } = useParams<{ locale: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return jobPostingTarget(pathname, locale, searchParams.get("employer"));
}
