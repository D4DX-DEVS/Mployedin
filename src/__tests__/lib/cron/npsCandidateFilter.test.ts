/** @jest-environment node */
import { npsCandidateFilter } from "@/lib/cron/npsCandidateFilter";

describe("npsCandidateFilter (JS-09)", () => {
  const start = new Date("2026-11-12T00:00:00Z");
  const end = new Date("2026-11-25T00:00:00Z");
  const f = npsCandidateFilter(start, end);

  it("keys the window on when the terminal status was entered, not updatedAt", () => {
    expect(f.statusHistory).toEqual({
      $elemMatch: { status: { $in: ["hired", "rejected", "withdrawn"] }, changedAt: { $gte: start, $lte: end } },
    });
    expect(f.updatedAt).toEqual({ $gte: start });
  });
});
