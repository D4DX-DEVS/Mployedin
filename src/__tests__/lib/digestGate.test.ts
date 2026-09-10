/**
 * @jest-environment node
 */
import { digestGateFor, MIN_HOURS_BETWEEN_DIGESTS } from "@/lib/notifications/digestGate";

const NOW = new Date("2026-09-10T09:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

describe("digestGateFor", () => {
  it("sends both sections when the seeker has no preference document yet", () => {
    expect(digestGateFor(null, { now: NOW })).toEqual({ send: true, jobs: true, profileViews: true });
  });

  it("sends both sections on default preferences", () => {
    expect(
      digestGateFor(
        { categories: { jobs: { enabled: true }, profile_views: { enabled: true } } },
        { now: NOW },
      ),
    ).toEqual({ send: true, jobs: true, profileViews: true });
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

  it("skips a seeker who already had a digest inside the cooldown", () => {
    const gate = digestGateFor({ lastDigestSentAt: hoursAgo(2) }, { now: NOW });
    expect(gate.send).toBe(false);
    expect(gate.reason).toBe("recent digest");
  });

  it("sends again once the cooldown has passed", () => {
    expect(digestGateFor({ lastDigestSentAt: hoursAgo(MIN_HOURS_BETWEEN_DIGESTS + 1) }, { now: NOW }).send).toBe(true);
  });

  /**
   * The point of the toggle: turning job alerts off must not also silence the
   * profile-view half of the same email. The old cron dropped the whole seeker.
   */
  it("keeps profile views when the seeker turned job alerts off", () => {
    expect(
      digestGateFor({ categories: { jobs: { enabled: false } } }, { now: NOW }),
    ).toEqual({ send: true, jobs: false, profileViews: true });
  });

  it("keeps job matches when the seeker turned profile views off", () => {
    expect(
      digestGateFor({ categories: { profile_views: { enabled: false } } }, { now: NOW }),
    ).toEqual({ send: true, jobs: true, profileViews: false });
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
