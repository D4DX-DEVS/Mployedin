/**
 * @jest-environment node
 */
import {
  digestGateFor,
  isWithinDigestCooldown,
  resolveDigestCadence,
  cadenceFromAvailability,
  cooldownHoursFor,
  MIN_HOURS_BETWEEN_DIGESTS,
  MIN_HOURS_BETWEEN_WEEKLY_DIGESTS,
} from "@/lib/notifications/digestGate";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("digestGateFor", () => {
  it("sends both sections when the seeker has no preference document yet", () => {
    expect(digestGateFor(null, { now: NOW })).toEqual({
      send: true,
      cadence: "weekly",
      jobs: true,
      profileViews: true,
    });
  });

  it("sends both sections on default preferences", () => {
    expect(
      digestGateFor(
        { categories: { jobs: { enabled: true }, profile_views: { enabled: true } } },
        { now: NOW },
      ),
    ).toEqual({ send: true, cadence: "weekly", jobs: true, profileViews: true });
  });

  it("skips a seeker who unsubscribed from everything", () => {
    const gate = digestGateFor({ unsubscribedAll: true }, { now: NOW });
    expect(gate.send).toBe(false);
    expect(gate.reason).toBe("unsubscribed");
  });

  it("skips a seeker who asked for no email", () => {
    const gate = digestGateFor({ emailFrequency: "none" }, { now: NOW });
    expect(gate.send).toBe(false);
    expect(gate.reason).toBe("email frequency none");
  });

  // These two state the frequency explicitly: the cooldown they exercise is
  // the daily one, and the platform default is now weekly.
  it("skips a seeker who already had a digest inside the cooldown", () => {
    const gate = digestGateFor({ emailFrequency: "daily", lastDigestSentAt: hoursAgo(2) }, { now: NOW });
    expect(gate.send).toBe(false);
    expect(gate.reason).toBe("recent digest");
  });

  it("sends again once the cooldown has passed", () => {
    expect(
      digestGateFor(
        { emailFrequency: "daily", lastDigestSentAt: hoursAgo(MIN_HOURS_BETWEEN_DIGESTS + 1) },
        { now: NOW },
      ).send,
    ).toBe(true);
  });

  /**
   * The point of the toggle: turning job alerts off must not also silence the
   * profile-view half of the same email. The old cron dropped the whole seeker.
   */
  it("keeps profile views when the seeker turned job alerts off", () => {
    expect(
      digestGateFor({ categories: { jobs: { enabled: false } } }, { now: NOW }),
    ).toEqual({ send: true, cadence: "weekly", jobs: false, profileViews: true });
  });

  it("keeps job matches when the seeker turned profile views off", () => {
    expect(
      digestGateFor({ categories: { profile_views: { enabled: false } } }, { now: NOW }),
    ).toEqual({ send: true, cadence: "weekly", jobs: true, profileViews: false });
  });

  it("skips the seeker when both sections are switched off", () => {
    const gate = digestGateFor(
      { categories: { jobs: { enabled: false }, profile_views: { enabled: false } } },
      { now: NOW },
    );
    expect(gate.send).toBe(false);
    expect(gate.reason).toBe("all digest categories disabled");
  });
});

describe("isWithinDigestCooldown", () => {
  it("is false when the seeker has never had a digest", () => {
    expect(isWithinDigestCooldown(undefined, NOW)).toBe(false);
    expect(isWithinDigestCooldown(null, NOW)).toBe(false);
  });

  it("is false for an unparseable timestamp rather than blocking forever", () => {
    expect(isWithinDigestCooldown("not a date", NOW)).toBe(false);
  });

  it("suppresses a second digest inside the window", () => {
    expect(isWithinDigestCooldown(hoursAgo(1), NOW)).toBe(true);
    expect(isWithinDigestCooldown(hoursAgo(MIN_HOURS_BETWEEN_DIGESTS - 1), NOW)).toBe(true);
  });

  it("allows the next day's digest once the window has passed", () => {
    expect(isWithinDigestCooldown(hoursAgo(MIN_HOURS_BETWEEN_DIGESTS), NOW)).toBe(false);
    expect(isWithinDigestCooldown(hoursAgo(24), NOW)).toBe(false);
  });

  it("accepts an ISO string as well as a Date, since Mongo round-trips both", () => {
    expect(isWithinDigestCooldown(hoursAgo(1).toISOString(), NOW)).toBe(true);
  });

  it("agrees with the eligibility gate it shares a definition with", () => {
    // The producer's atomic claim and digestGateFor must never disagree about
    // whether today's digest already went out — that disagreement is what let
    // a failed send be retried and re-sent. The claim now passes the seeker's
    // cadence, so the comparison must too.
    for (const h of [0, 1, 12, MIN_HOURS_BETWEEN_DIGESTS - 0.5, MIN_HOURS_BETWEEN_DIGESTS, 48]) {
      const last = hoursAgo(h);
      const gate = digestGateFor(
        { emailFrequency: "daily", lastDigestSentAt: last },
        { now: NOW },
      );
      expect(gate.send).toBe(!isWithinDigestCooldown(last, NOW, "daily"));
    }
  });
});

describe("Cadence", () => {
  it("defaults a seeker with no preference document to the platform default", () => {
    // Every seeker on the platform is in this state — preference documents are
    // created lazily and none exist yet.
    expect(resolveDigestCadence(undefined)).toBe("weekly");
    expect(resolveDigestCadence(null, "daily")).toBe("daily");
    expect(resolveDigestCadence({})).toBe("weekly");
  });

  it("honours an explicit choice over the platform default", () => {
    expect(resolveDigestCadence({ emailFrequency: "daily" }, "weekly")).toBe("daily");
    expect(resolveDigestCadence({ emailFrequency: "weekly" }, "daily")).toBe("weekly");
    expect(resolveDigestCadence({ emailFrequency: "none" }, "daily")).toBe("none");
  });

  it("maps instant to daily — there is no true instant channel", () => {
    // LinkedIn does the same: instant exists for saved searches, not for
    // profile-based recommendations.
    expect(resolveDigestCadence({ emailFrequency: "instant" })).toBe("daily");
  });

  it("treats unsubscribedAll as none whatever the frequency says", () => {
    expect(resolveDigestCadence({ emailFrequency: "daily", unsubscribedAll: true })).toBe("none");
  });

  it("does NOT send a weekly seeker the daily digest", () => {
    // The bug this pins: emailFrequency was read for one value only ("none"),
    // so a seeker who chose weekly received the daily digest every morning AND
    // the Sunday summary. No live account had picked weekly yet, so it had
    // never fired — it would have on the first one.
    const yesterday = hoursAgo(25);
    const weekly = digestGateFor(
      { emailFrequency: "weekly", lastDigestSentAt: yesterday },
      { now: NOW },
    );
    expect(weekly.send).toBe(false);
    expect(weekly.reason).toBe("weekly cadence");

    // The same seeker on daily would go out.
    const daily = digestGateFor(
      { emailFrequency: "daily", lastDigestSentAt: yesterday },
      { now: NOW },
    );
    expect(daily.send).toBe(true);
  });

  it("releases a weekly seeker once their week has passed", () => {
    const gate = digestGateFor(
      { emailFrequency: "weekly", lastDigestSentAt: hoursAgo(MIN_HOURS_BETWEEN_WEEKLY_DIGESTS) },
      { now: NOW },
    );
    expect(gate.send).toBe(true);
    expect(gate.cadence).toBe("weekly");
  });

  it("uses a window under seven days so the weekly slot cannot drift", () => {
    // An exact 168h gap plus a fixed cron time pushes the seeker one day later
    // each week until a cycle is skipped entirely.
    expect(cooldownHoursFor("weekly")).toBeLessThan(168);
    expect(cooldownHoursFor("weekly")).toBeGreaterThan(MIN_HOURS_BETWEEN_DIGESTS * 5);
    expect(cooldownHoursFor("daily")).toBe(MIN_HOURS_BETWEEN_DIGESTS);
  });

  it("reports the cadence so the producer claims with the right window", () => {
    // Claiming a weekly seeker with the 23-hour window would re-release them
    // the next morning.
    expect(digestGateFor({ emailFrequency: "daily" }, { now: NOW }).cadence).toBe("daily");
    expect(digestGateFor({ emailFrequency: "weekly" }, { now: NOW }).cadence).toBe("weekly");
  });
});

describe("Cadence from stated availability", () => {
  const ANSWERED = new Date("2026-09-01T00:00:00.000Z");

  it("ignores availability the seeker never actually answered", () => {
    // `availabilityStatus` defaults to "immediately" and is written at signup.
    // 228 of 239 live profiles carry it; none of them chose it. Reading that
    // as "actively job hunting" would put the whole platform back on daily.
    expect(cadenceFromAvailability({ status: "immediately" })).toBeNull();
    expect(cadenceFromAvailability({ status: "immediately", setAt: null })).toBeNull();
    expect(cadenceFromAvailability(undefined)).toBeNull();
    expect(cadenceFromAvailability({ setAt: ANSWERED })).toBeNull();
  });

  it("follows Naukri's pattern once the seeker has answered", () => {
    expect(cadenceFromAvailability({ status: "immediately", setAt: ANSWERED })).toBe("daily");
    expect(cadenceFromAvailability({ status: "within_month", setAt: ANSWERED })).toBe("weekly");
    expect(cadenceFromAvailability({ status: "within_3_months", setAt: ANSWERED })).toBe("weekly");
  });

  it("stops job mail for a seeker who said they are not looking", () => {
    // This asserted "weekly" until 2026-09-22, on the reasoning that people
    // come back. They may — but mailing job adverts to someone who explicitly
    // said they are not job hunting is the definition of unsolicited. Only an
    // answered status reaches this branch, so nobody is silenced by a default.
    expect(cadenceFromAvailability({ status: "not_available", setAt: ANSWERED })).toBe("none");
    // The schema default is not an answer, so it must not silence anyone.
    expect(cadenceFromAvailability({ status: "not_available", setAt: null })).toBeNull();
  });

  it("lets availability override the platform default but not an explicit choice", () => {
    const answered = { status: "immediately", setAt: ANSWERED };
    // No notification preference saved -> availability decides.
    expect(resolveDigestCadence(undefined, "weekly", answered)).toBe("daily");
    // An explicit setting always wins over an inference.
    expect(resolveDigestCadence({ emailFrequency: "weekly" }, "weekly", answered)).toBe("weekly");
    expect(resolveDigestCadence({ unsubscribedAll: true }, "weekly", answered)).toBe("none");
  });

  it("falls back to the platform default when availability says nothing", () => {
    expect(resolveDigestCadence(undefined, "weekly", { status: "immediately" })).toBe("weekly");
  });
});
