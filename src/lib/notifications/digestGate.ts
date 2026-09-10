/**
 * Which halves of the daily digest a seeker still wants.
 *
 * The digest carries two independent things — new job matches and who looked at
 * the profile — and the seeker has a switch for each. Deciding that per seeker
 * (instead of excluding them wholesale, as the fetch query used to) is what
 * makes "Job Match Alerts: off" mean *only* that.
 */

/** A seeker gets at most one digest per this many hours. */
export const MIN_HOURS_BETWEEN_DIGESTS = 23;

/** The slice of NotificationPreference this decision reads. Lean docs satisfy it. */
export interface DigestPreferenceLike {
  unsubscribedAll?: boolean;
  emailFrequency?: string;
  lastDigestSentAt?: Date | string | null;
  categories?: {
    jobs?: { enabled?: boolean } | null;
    profile_views?: { enabled?: boolean } | null;
  } | null;
}

export interface DigestGate {
  /** False = build nothing for this seeker today. */
  send: boolean;
  /** Why the digest was withheld. Absent when `send` is true. */
  reason?: string;
  /** Include the job-match section. */
  jobs: boolean;
  /** Include the profile-view section. */
  profileViews: boolean;
}

const withheld = (reason: string): DigestGate => ({ send: false, reason, jobs: false, profileViews: false });

/**
 * Every category defaults to ON: a seeker with no preference document, or one
 * saved before a category existed, is opted in — the same default the model
 * declares.
 */
export function digestGateFor(
  pref: DigestPreferenceLike | null | undefined,
  opts: { now?: Date } = {},
): DigestGate {
  const now = opts.now ?? new Date();

  if (pref?.unsubscribedAll) return withheld("unsubscribed");
  if (pref?.emailFrequency === "none") return withheld("email frequency none");

  if (pref?.lastDigestSentAt) {
    const last = new Date(pref.lastDigestSentAt).getTime();
    if (Number.isFinite(last) && now.getTime() - last < MIN_HOURS_BETWEEN_DIGESTS * 60 * 60 * 1000) {
      return withheld("recent digest");
    }
  }

  const jobs = pref?.categories?.jobs?.enabled !== false;
  const profileViews = pref?.categories?.profile_views?.enabled !== false;
  if (!jobs && !profileViews) return withheld("all digest categories disabled");

  return { send: true, jobs, profileViews };
}
