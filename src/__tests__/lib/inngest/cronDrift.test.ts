/**
 * @jest-environment node
 *
 * The job-alert digest declares an hourly cron, but Inngest Cloud runs whatever
 * schedule it was last *synced* with. From 2026-09-23 to at least 2026-10-27 it
 * was still firing the old once-a-day 09:00 UTC trigger, the code mailed only
 * seekers whose local clock read 9am, and so nobody in the Gulf or India got a
 * single alert — silently, because nothing compared one run with the last.
 */
import {
  ADMIN_DISABLED_SKIP_MESSAGE,
  detectCronDrift,
} from "@/lib/inngest/cronDrift";

const now = new Date("2026-10-27T09:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600e3);

describe("detectCronDrift", () => {
  it("is quiet when the previous run was an hour ago", () => {
    expect(detectCronDrift({ lastRunAt: hoursAgo(1), lastRunStatus: "success" }, now)).toEqual({ drifted: false });
  });

  it("tolerates a late or slow hourly run", () => {
    expect(detectCronDrift({ lastRunAt: hoursAgo(1.9), lastRunStatus: "success" }, now).drifted).toBe(false);
  });

  it("flags a daily cadence — the stale-sync symptom", () => {
    const drift = detectCronDrift({ lastRunAt: hoursAgo(24), lastRunStatus: "success", lastRunMessage: "Processed 2" }, now);
    expect(drift.drifted).toBe(true);
    expect(drift.gapHours).toBe(24);
    expect(drift.message).toContain("24h");
    expect(drift.message).toContain("every hour");
    // The first run after a resync also sees an old timestamp — say so, so
    // nobody chases a ghost.
    expect(drift.message).toMatch(/resync/i);
    expect(drift.message).toMatch(/first run after a pause/i);
  });

  it("accepts the ISO strings a lean read can hand back", () => {
    expect(detectCronDrift({ lastRunAt: hoursAgo(5).toISOString() }, now).drifted).toBe(true);
  });

  it("does not flag the run after an admin re-enables the job", () => {
    const previous = { lastRunAt: hoursAgo(72), lastRunStatus: "success", lastRunMessage: ADMIN_DISABLED_SKIP_MESSAGE };
    expect(detectCronDrift(previous, now)).toEqual({ drifted: false });
  });

  it("has nothing to compare on a first ever run", () => {
    expect(detectCronDrift(undefined, now)).toEqual({ drifted: false });
    expect(detectCronDrift(null, now)).toEqual({ drifted: false });
    expect(detectCronDrift({}, now)).toEqual({ drifted: false });
  });

  it("ignores an unreadable or future timestamp rather than inventing a gap", () => {
    expect(detectCronDrift({ lastRunAt: "not a date" }, now)).toEqual({ drifted: false });
    expect(detectCronDrift({ lastRunAt: new Date(now.getTime() + 3600e3) }, now)).toEqual({ drifted: false });
  });

  it("rounds the gap to one decimal", () => {
    expect(detectCronDrift({ lastRunAt: hoursAgo(2.46) }, now).gapHours).toBe(2.5);
  });
});
