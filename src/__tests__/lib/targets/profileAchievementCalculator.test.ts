/**
 * @jest-environment node
 */
import {
  calculateOverallTargetProgress,
  getIncentiveTier,
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