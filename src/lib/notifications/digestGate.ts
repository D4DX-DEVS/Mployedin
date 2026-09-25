/**
 * Whether a seeker is due a digest, and which halves of it they still want.
 *
 * The digest carries two independent things — new job matches and who looked at
 * the profile — and the seeker has a switch for each. Deciding that per seeker
 * (instead of excluding them wholesale, as the fetch query used to) is what
 * makes "Job Match Alerts: off" mean *only* that.
 *
 * Cadence
 * -------
 * Every major board (Indeed, Naukri, Bayt, LinkedIn) offers unsolicited
 * profile-based recommendations at daily OR weekly, and none faster. We do the
 * same, but the cron still runs every morning: rather than pinning weekly
 * seekers to a fixed day, the gate holds them until seven days have passed and
 * then releases them on the first morning there is something worth sending.
 * A fixed Tuesday slot mails whatever happens to exist on Tuesday.
 *
 * `emailFrequency` used to be read for one value only — `"none"` — so a seeker
 * who chose *weekly* received the daily digest every morning AND the Sunday
 * activity digest. No live account had picked weekly yet, so the double-send
 * had never fired; it would have on the first one.
 */

/** A daily-cadence seeker gets at most one digest per this many hours. */
export const MIN_HOURS_BETWEEN_DIGESTS = 23;

/**
 * A weekly-cadence seeker gets at most one per this many hours.
 *
 * 6.5 days, not 7: the cron fires at a fixed time each morning, so an exact
 * 168-hour gap would drift a seeker one day later every week and eventually
 * skip one entirely.
 */
export const MIN_HOURS_BETWEEN_WEEKLY_DIGESTS = 156;

/** How often a seeker is willing to hear from the recommendation engine. */
export type DigestCadence = "daily" | "weekly" | "none";

/**
 * How soon the seeker said they could start, and whether they actually said it.
 *
 * `JobSeeker.availabilityStatus` defaults to "immediately" and is written at
 * signup, so the value alone proves nothing — 228 of 239 live profiles carry
 * it and none of them chose it. `setAt` is stamped only when the seeker saves
 * the field themselves; absent means unanswered, and unanswered must not be
 * read as intent.
 */
export interface AvailabilitySignal {
  status?: string | null;
  setAt?: Date | string | null;
}

/**
 * Cadence implied by a seeker's stated availability, or `null` when they have
 * not stated one.
 *
 * Naukri's published pattern, which their own help pages describe for job
 * *recommendations* rather than saved-search alerts: "immediately looking"
 * gets daily recommendations, "not actively looking but open" gets weekly, and
 * "not looking for a job change" gets none.
 *
 * We only apply it to an actual answer — `setAt` is what distinguishes a choice
 * from the schema default that 228 of 239 live profiles carry.
 */
export function cadenceFromAvailability(
  availability: AvailabilitySignal | null | undefined,
): DigestCadence | null {
  if (!availability?.setAt || !availability.status) return null;
  switch (availability.status) {
    case "immediately":
      return "daily";
    case "within_month":
    case "within_3_months":
      return "weekly";
    case "not_available":
      // Not looking, and they said so on a date we can point to. An earlier
      // draft kept these on weekly — "people come back" — but that is sending
      // job adverts to someone who explicitly asked not to be job hunting, and
      // it is the read that turns a digest into spam. Naukri stops here too.
      // Re-engagement mail is separate and still reaches them.
      return "none";
    default:
      return null;
  }
}

/**
 * Resolve a seeker's cadence, most explicit signal first:
 *
 *   1. unsubscribed / emailFrequency  — what they told the notification settings
 *   2. stated availability            — what they told their profile
 *   3. platform default               — what the admin set
 *
 * `instant` maps to daily: we have no true instant channel, and LinkedIn makes
 * the same call (instant exists for saved searches, not for profile
 * recommendations). A seeker with no preference document at all — which is
 * every seeker on the platform today, since the documents are created lazily —
 * falls through to steps 2 and 3.
 */
export function resolveDigestCadence(
  pref: DigestPreferenceLike | null | undefined,
  platformDefault: DigestCadence = "weekly",
  availability?: AvailabilitySignal | null,
): DigestCadence {
  if (pref?.unsubscribedAll) return "none";
  switch (pref?.emailFrequency) {
    case "none":
      return "none";
    case "weekly":
      return "weekly";
    case "daily":
    case "instant":
      return "daily";
    default:
      return cadenceFromAvailability(availability) ?? platformDefault;
  }
}

/** The cooldown that applies at a given cadence. */
export function cooldownHoursFor(cadence: DigestCadence): number {
  return cadence === "weekly" ? MIN_HOURS_BETWEEN_WEEKLY_DIGESTS : MIN_HOURS_BETWEEN_DIGESTS;
}

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
  /** The seeker's resolved cadence. Drives the cooldown the producer claims with. */
  cadence?: DigestCadence;
  /** Include the job-match section. */
  jobs: boolean;
  /** Include the profile-view section. */
  profileViews: boolean;
}

const withheld = (reason: string): DigestGate => ({ send: false, reason, jobs: false, profileViews: false });

/**
 * Whether a digest sent at `last` still suppresses another one at `now`.
 *
 * The one definition of "already had today's digest", shared by the eligibility
 * gate below and by the producer's atomic claim. They disagreed by construction
 * before: the gate was evaluated once per run while the timestamp was written
 * by a *different* Inngest function after a successful send, so a failed send
 * left the gate wide open and every retry re-sent. During the 10–16 September
 * SMTP outage that turned ~224 digests a day into 872 delivery attempts.
 */
export function isWithinDigestCooldown(
  last: Date | string | null | undefined,
  now: Date,
  cadence: DigestCadence = "daily",
): boolean {
  if (!last) return false;
  const t = new Date(last).getTime();
  if (!Number.isFinite(t)) return false;
  return now.getTime() - t < cooldownHoursFor(cadence) * 60 * 60 * 1000;
}

/**
 * Every category defaults to ON: a seeker with no preference document, or one
 * saved before a category existed, is opted in — the same default the model
 * declares.
 */
export function digestGateFor(
  pref: DigestPreferenceLike | null | undefined,
  opts: {
    now?: Date;
    platformDefault?: DigestCadence;
    /** The seeker's stated availability, when the caller has loaded it. */
    availability?: AvailabilitySignal | null;
  } = {},
): DigestGate {
  const now = opts.now ?? new Date();
  const cadence = resolveDigestCadence(pref, opts.platformDefault ?? "weekly", opts.availability);

  if (cadence === "none") {
    return withheld(pref?.unsubscribedAll ? "unsubscribed" : "email frequency none");
  }

  // A weekly seeker is not excluded from the daily run — they are simply held
  // by a seven-day cooldown and released on the first morning after it that
  // has something worth sending.
  if (isWithinDigestCooldown(pref?.lastDigestSentAt, now, cadence)) {
    return withheld(cadence === "weekly" ? "weekly cadence" : "recent digest");
  }

  const jobs = pref?.categories?.jobs?.enabled !== false;
  const profileViews = pref?.categories?.profile_views?.enabled !== false;
  if (!jobs && !profileViews) return withheld("all digest categories disabled");

  return { send: true, cadence, jobs, profileViews };
}

/**
 * Whether a digest has anything worth sending: jobs that cleared the bar, or
 * recruiters who viewed the profile.
 *
 * "Nothing matched" is not on the list. On 2026-09-23 187 of 188 job emails
 * said "No strong job matches this week" — the platform's main job email had
 * become a notice that it had no jobs. Indeed only mails when a new job
 * matches, and the owner's rule is the same: no strong match, no email. The
 * explanation of what is holding a seeker back still appears in-app, and in a
 * digest that is going out anyway for profile views.
 */
export function hasDigestContent(counts: { jobCount: number; profileViewCount: number }): boolean {
  return counts.jobCount > 0 || counts.profileViewCount > 0;
}
