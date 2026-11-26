/** @jest-environment node */
import { recommendableJobsFilter } from "@/lib/inngest/recommendableJobsFilter";

describe("recommendableJobsFilter (EMP-05)", () => {
  const now = new Date("2026-11-26T09:00:00Z");
  const f = recommendableJobsFilter(now);

  it("leaves private and invite-only jobs out of recommendation emails", () => {
    expect(f.visibility).toEqual({ $nin: ["private", "invite_only"] });
  });

  it("keeps the active and unexpired conditions", () => {
    expect(f.status).toBe("active");
    expect(f.$or).toEqual([{ expiresAt: null }, { expiresAt: { $gte: now } }]);
  });
});
