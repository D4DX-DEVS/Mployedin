import { equalKpiPeriods, kpiPeriodIssues, manualKpiPeriods, splitCount } from "@/lib/targets/kpiSchedule";

describe("kpi3 monthly schedule", () => {
  it("splits counts into whole numbers, remainder to the first months", () => {
    expect(splitCount(4, 12)).toEqual([1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(splitCount(25, 12).reduce((a, b) => a + b, 0)).toBe(25);
    expect(splitCount(0, 12).every((n) => n === 0)).toBe(true);
  });

  it("builds twelve months that add up to each yearly target", () => {
    const totals = { jobTarget: 48, conversionTarget: 10, revenueTarget: 1000 };
    const periods = equalKpiPeriods(2027, totals);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toEqual(expect.objectContaining({ startDate: "2027-01-01", endDate: "2027-01-31", jobTarget: 4, profitTarget: 0 }));
    expect(kpiPeriodIssues(periods, totals)).toEqual([]);
  });

  it("flags manual months that do not add up or are not whole", () => {
    const totals = { jobTarget: 12, conversionTarget: 0, revenueTarget: 120 };
    const months = Array.from({ length: 12 }, () => ({ jobTarget: 1, conversionTarget: 0, revenueTarget: 10 }));
    expect(kpiPeriodIssues(months, totals)).toEqual([]);
    months[0] = { jobTarget: 1.5, conversionTarget: 0, revenueTarget: 11 };
    expect(kpiPeriodIssues(months, totals)).toEqual(["whole", "jobsSum", "revenueSum"]);
    expect(kpiPeriodIssues(months.slice(1), totals)).toEqual(["months"]);
    expect(manualKpiPeriods(2027, months)[0].jobTarget).toBe(1.5);
  });
});
