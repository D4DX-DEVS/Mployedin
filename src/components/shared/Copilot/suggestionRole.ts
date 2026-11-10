export type SuggestionRole = "employer" | "jobSeeker" | "agent" | "superAgent" | "admin" | "default";

const AREA_ROLE: Record<string, SuggestionRole> = {
  admin: "admin",
  "super-agent": "superAgent",
  agent: "agent",
  employer: "employer",
  "job-seeker": "jobSeeker",
};

/**
 * The role whose suggestions the Copilot shows, from the dashboard area in the
 * path (`/en/admin/...` → admin). Only the area segment counts: searching the
 * whole path made `/admin/job-seekers` read as a job seeker.
 */
export function roleFromPathname(pathname: string): SuggestionRole {
  const segments = pathname.split("/").filter(Boolean);
  // Skip a leading locale ("en", "ar").
  const area = /^[a-z]{2}(-[A-Z]{2})?$/.test(segments[0] ?? "") ? segments[1] : segments[0];
  return (area && AREA_ROLE[area]) || "default";
}
