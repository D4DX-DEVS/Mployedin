import { kpiPace, kpiRisk, yearElapsedPercent } from "@/lib/targets/kpiRisk";

describe("kpi3 risk rule", () => {
  const target = { jobTarget: 100, conversionTarget: 20, revenueTarget: 100000 };

  it("is quiet early in the year", () => {
    expect(kpiRisk({ actual: { jobs: 0, onboarded: 0, revenue: 0 }, target, expectedProgress: 5 })).toBeNull();
  });

  it("is quiet when every pillar is at 60% of pace or better", () => {
    // pace 50%: floor is 30%
    expect(kpiRisk({ actual: { jobs: 30, onboarded: 6, revenue: 30000 }, target, expectedProgress: 50 })).toBeNull();
  });

  it("names the weakest pillar behind pace", () => {
    const risk = kpiRisk({ actual: { jobs: 25, onboarded: 2, revenue: 40000 }, target, expectedProgress: 50 });
    expect(risk).toEqual({ pillar: "onboarded", progress: 10, expectedProgress: 50 });
  });

  it("ignores pillars with no target", () => {
    expect(kpiRisk({ actual: { jobs: 0, onboarded: 0, revenue: 0 }, target: { jobTarget: 10 }, expectedProgress: 50 }))
      .toEqual({ pillar: "jobs", progress: 0, expectedProgress: 50 });
    expect(kpiRisk({ actual: { jobs: 0, onboarded: 0, revenue: 0 }, target: {}, expectedProgress: 90 })).toBeNull();
  });

  it("works out how much of the year is gone", () => {
    expect(yearElapsedPercent(new Date(Date.UTC(2026, 0, 1)), 2026)).toBe(0);
    expect(yearElapsedPercent(new Date(Date.UTC(2026, 6, 2)), 2026)).toBe(50);
    expect(yearElapsedPercent(new Date(Date.UTC(2027, 3, 1)), 2026)).toBe(100);
  });
});

describe("kpi3 pace for dashboard tiles", () => {
  const target = { jobTarget: 100, conversionTarget: 20 };
  it("achieved only when every set pillar reaches 100%", () => {
    expect(kpiPace({ actual: { jobs: 100, onboarded: 20, revenue: 0 }, target, expectedProgress: 80 })).toBe("achieved");
    expect(kpiPace({ actual: { jobs: 100, onboarded: 19, revenue: 0 }, target, expectedProgress: 80 })).toBe("onPace");
  });
  it("behind when a pillar is more than 10 points under pace", () => {
    expect(kpiPace({ actual: { jobs: 39, onboarded: 10, revenue: 0 }, target, expectedProgress: 50 })).toBe("behind");
    expect(kpiPace({ actual: { jobs: 40, onboarded: 10, revenue: 0 }, target, expectedProgress: 50 })).toBe("onPace");
  });
});
