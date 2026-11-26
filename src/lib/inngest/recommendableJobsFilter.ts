/**
 * Jobs a daily recommendation email may list: active, unexpired and public.
 * Private and invite-only jobs were mailed to every matching seeker (EMP-05).
 * A missing `visibility` is legacy public.
 */
export function recommendableJobsFilter(now: Date) {
  return {
    status: "active",
    visibility: { $nin: ["private", "invite_only"] },
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
  };
}
