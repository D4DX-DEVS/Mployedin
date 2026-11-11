/**
 * Company disclosure on a job posting.
 *
 * A poster can post a job without revealing the company. When
 * `Job.discloseCompany` is explicitly `false`, everyone outside the owning side
 * (job seekers, the public board, emails to seekers) sees "Mployedin" with no
 * logo or company details. Applications and the job itself stay on the posting
 * employer — only what is *shown* changes.
 *
 * Jobs created before this setting have no value (`undefined`) and stay
 * disclosed, so nothing already live changes. New jobs are written with an
 * explicit `false` by default.
 */
export const HIDDEN_COMPANY_NAME = "Mployedin";
/** The Mployedin globe, shown wherever the company's own logo would be. */
export const HIDDEN_COMPANY_LOGO = "/mployedin-mark.png";

/** True when the job should show the platform instead of the company. */
export function isCompanyHidden(job: { discloseCompany?: boolean | null } | null | undefined): boolean {
  return job?.discloseCompany === false;
}

/** Name to show a viewer who is not on the owning side. */
export function displayCompanyName(
  job: { discloseCompany?: boolean | null } | null | undefined,
  companyName: string | null | undefined,
  fallback = HIDDEN_COMPANY_NAME,
): string {
  if (isCompanyHidden(job)) return HIDDEN_COMPANY_NAME;
  return companyName || fallback;
}

/**
 * Replace a populated `employerId` on a lean job with a masked stub, in place.
 * Owner-side callers must not call this.
 */
export function maskJobEmployer<T extends Record<string, unknown>>(job: T): T {
  if (!isCompanyHidden(job as { discloseCompany?: boolean })) return job;
  // No id either: it would link seekers to the company's profile page.
  (job as Record<string, unknown>).employerId = { companyName: HIDDEN_COMPANY_NAME, logo: HIDDEN_COMPANY_LOGO };
  return job;
}

/** Logo to show a viewer who is not on the owning side. */
export function displayCompanyLogo(
  job: { discloseCompany?: boolean | null } | null | undefined,
  logo: string | null | undefined,
): string | undefined {
  if (isCompanyHidden(job)) return HIDDEN_COMPANY_LOGO;
  return logo || undefined;
}
