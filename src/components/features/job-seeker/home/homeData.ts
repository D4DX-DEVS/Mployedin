/**
 * Shapes and small rules the seeker home shares between the server page and
 * its client pieces. No server or browser imports.
 */

/** Statuses where the application is still in play — the "Active applications" tile. */
export const ACTIVE_APPLICATION_STATUSES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
] as const;

/** A resume the seeker holds, as the home's CV card needs it (no file URL). */
export type HomeResume = {
  id: string;
  name: string;
  uploadedAt?: string;
  /** Set on the stored copy of the built CV. */
  builtHash?: string;
};

export type AppliedJobSnippet = {
  _id: string;
  title: string;
  companyName?: string;
  companyLogo?: string;
  status: string;
  appliedAt?: string;
  /** When the status last changed; the application date when it never did. */
  changedAt?: string;
  /** "City, Country" of the job. */
  place?: string;
};

export type DashboardStats = {
  applicationsSent?: { count: number };
  activeApplications?: { count: number };
  /** At the seeker's Interview step (interviewing or selected). */
  interviewing?: { count: number };
  upcomingInterviews?: { count: number };
  recruiterViews?: { total: number };
  pendingOffers?: { count: number };
  unreadMessages?: { count: number };
};

/** A date as "Nov 11", with the year only when it is not this year. */
export function shortDate(iso: string | undefined, locale: string): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(locale === "ar" ? "ar-SA" : "en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
