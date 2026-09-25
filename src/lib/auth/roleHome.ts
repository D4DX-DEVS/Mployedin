const ROLE_HOME_SEGMENT: Record<string, string> = {
  admin: "admin",
  employer: "employer",
  job_seeker: "job-seeker",
  agent: "agent",
  super_agent: "super-agent",
};

/** The dashboard home for a role, e.g. `/en/super-agent`. Unknown roles land on the job-seeker home. */
export function roleHomePath(locale: string, role: string | undefined | null): string {
  return `/${locale}/${ROLE_HOME_SEGMENT[role ?? ""] ?? "job-seeker"}`;
}

/** Where a user goes right after signing in: a job seeker who hasn't finished onboarding goes back to it. */
export function postSignInPath(locale: string, role: string, isOnboarded: boolean): string {
  if (role === "job_seeker" && !isOnboarded) return `/${locale}/onboarding`;
  return roleHomePath(locale, role);
}
