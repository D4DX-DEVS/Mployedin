/**
 * @jest-environment node
 */
import {
  calculateOverallTargetProgress,
  expectedProgressPct,
  getIncentiveTier,
  getRiskScore,
} from "@/lib/targets/profileAchievementCalculator";

describe("calculateOverallTargetProgress", () => {
  it("includes employer, employee, and finance progress equally", () => {
    expect(
      calculateOverallTargetProgress([
        { target: 20, progress: 60 },
        { target: 300, progress: 0 },
        { target: 300000, progress: 0 },
      ])
    ).toBe(20);
  });

  it("does not mark a target complete when finance is still pending", () => {
    expect(
      calculateOverallTargetProgress([
        { target: 5, progress: 100 },
        { target: 10, progress: 100 },
        { target: 50000, progress: 0 },
      ])
    ).toBe(67);
  });

  it("ignores categories with no assigned target", () => {
    expect(
      calculateOverallTargetProgress([
        { target: 0, progress: 0 },
        { target: 10, progress: 50 },
        { target: 0, progress: 0 },
      ])
    ).toBe(50);
  });
});

describe("getIncentiveTier", () => {
  it.each([
    [0, "none"],
    [39, "none"],
    [40, "bronze"],
    [59, "bronze"],
    [60, "silver"],
    [79, "silver"],
    [80, "gold"],
    [99, "gold"],
    [100, "platinum"],
    [150, "platinum"],
  ] as const)("returns %s tier for %s%% progress", (progress, expected) => {
    expect(getIncentiveTier(progress)).toBe(expected);
  });
});
describe("expectedProgressPct", () => {
  const september2026 = new Date(2026, 8, 15);

  it("expects the months elapsed of the current year", () => {
    expect(expectedProgressPct(2026, september2026)).toBe(75);
  });

  it("expects all of a past year and none of a future one", () => {
    expect(expectedProgressPct(2025, september2026)).toBe(100);
    expect(expectedProgressPct(2027, september2026)).toBe(0);
  });
});

describe("getRiskScore", () => {
  const september2026 = new Date(2026, 8, 15);

  it("scores against the profile's own year, not today's month", () => {
    // Nothing of 2027 is due yet, so an untouched 2027 plan is not at risk.
    expect(getRiskScore(0, 2027, september2026)).toBe("low");
    expect(getRiskScore(0, 2026, september2026)).toBe("high");
  });

  it("is medium between 10 and 20 points under the expected share", () => {
    expect(getRiskScore(60, 2026, september2026)).toBe("medium");
    expect(getRiskScore(65, 2026, september2026)).toBe("low");
    expect(getRiskScore(54, 2026, september2026)).toBe("high");
  });
});
