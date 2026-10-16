/**
 * @jest-environment node
 */
import {
  expectedProgressPct,
  getIncentiveTier,
  getRiskScore,
  pct,
} from "@/lib/targets/profileAchievementCalculator";

describe("pct", () => {
  it("is the rounded share of the target", () => {
    expect(pct(500, 2000)).toBe(25);
    expect(pct(1, 3)).toBe(33);
  });

  it("is 0 without a target and caps a runaway outlier at 999", () => {
    expect(pct(500, 0)).toBe(0);
    expect(pct(1_000_000, 10)).toBe(999);
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
