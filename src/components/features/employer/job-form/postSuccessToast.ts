import type { ExternalToast } from "sonner";
import { POSTERS_ENABLED } from "@/lib/features/posterFeature";

export interface PostSuccessToastInput {
  /** "employer" | "admin" | "agent": the dashboard the job was posted from. */
  basePath: string;
  /** Where "Create Poster" goes (the employer job page with ?poster=1). */
  posterHref: string;
  push: (href: string) => void;
  labels: { description: string; descriptionNoPoster: string; createPoster: string };
  postersEnabled?: boolean;
}

/**
 * Where the job form goes after a save or a post. Employers and agents have a
 * page per job; admins do not — sending them to /admin/jobs/<id> showed "Page
 * not found" after Save Draft (bug report 2026-10-28) — so they return to the
 * jobs list, as the admin edit page already does.
 */
export function jobLandingHref(locale: string, basePath: string, jobId: string | undefined): string {
  const jobs = `/${locale}/${basePath}/jobs`;
  return jobId && basePath !== "admin" ? `${jobs}/${jobId}` : jobs;
}

/**
 * Options for the "Job posted" toast. Only the employer job page has the poster
 * maker; the admin link landed on a page that ignored it, so only employers get
 * the action.
 */
export function postSuccessToastOptions({
  basePath,
  posterHref,
  push,
  labels,
  postersEnabled = POSTERS_ENABLED,
}: PostSuccessToastInput): ExternalToast {
  if (!postersEnabled) return { description: labels.descriptionNoPoster, duration: 8000 };
  return {
    description: labels.description,
    ...(basePath === "employer"
      ? { action: { label: labels.createPoster, onClick: () => push(posterHref) } }
      : {}),
    duration: 8000,
  };
}
