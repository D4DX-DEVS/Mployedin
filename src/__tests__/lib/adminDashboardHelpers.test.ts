/**
 * @jest-environment node
 */
import { isDashboardPeriod, MIN_PERCENT_BASELINE, percentChange, periodChange, resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { targetPace } from "@/lib/admin/dashboard/people.server";
import { databaseStatus, emailStatus, lockedAccountsStatus, webhookStatus } from "@/lib/admin/dashboard/health.server";
import { getHiringFunnel } from "@/lib/admin/dashboard/recruitment.server";
import Application from "@/models/Application";
import { JOB_EXPIRING_WINDOWS, jobsExpiringFilter } from "@/lib/admin/queueFilters";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-24T10:00:00.000Z");

describe("resolveDashboardPeriod", () => {
  it("builds the current window and an equally long previous one", () => {
    const period = resolveDashboardPeriod("7d", NOW);
    expect(period.key).toBe("7d");
    expect(period.days).toBe(7);
    expect(NOW.getTime() - period.start.getTime()).toBe(7 * DAY_MS);
    expect(period.start.getTime() - period.previousStart.getTime()).toBe(7 * DAY_MS);
  });

  it("falls back to 30 days for a missing or hand-edited value", () => {
    for (const value of [undefined, "", "365d", "7", ["7d"]]) {
      expect(resolveDashboardPeriod(value, NOW).key).toBe("30d");
    }
    expect(isDashboardPeriod("90d")).toBe(true);
    expect(isDashboardPeriod("1y")).toBe(false);
  });
});

describe("percentChange", () => {
  it("rounds to whole percent in both directions", () => {
    expect(percentChange(24, 20)).toBe(20);
    expect(percentChange(35, 50)).toBe(-30);
    expect(percentChange(5, 5)).toBe(0);
  });

  it("returns null when there is nothing to compare with", () => {
    expect(percentChange(12, 0)).toBeNull();
    expect(percentChange(0, 0)).toBeNull();
  });
});

describe("periodChange", () => {
  it("uses a percentage once the previous period is a fair baseline", () => {
    expect(periodChange(39, 22)).toEqual({ kind: "percent", value: 77 });
    expect(periodChange(35, MIN_PERCENT_BASELINE)).toEqual({ kind: "percent", value: 250 });
  });

  it("gives the difference as a count when the baseline is too small for a percentage", () => {
    // 1 → 42 is "Up 4100%" as a percentage; 41 more says what happened.
    expect(periodChange(42, 1)).toEqual({ kind: "count", value: 41 });
    expect(periodChange(2, 5)).toEqual({ kind: "count", value: -3 });
    expect(periodChange(4, 4)).toEqual({ kind: "count", value: 0 });
  });

  it("separates nothing-before from nothing-at-all", () => {
    expect(periodChange(9, 0)).toEqual({ kind: "new" });
    expect(periodChange(0, 0)).toEqual({ kind: "none" });
  });
});

describe("targetPace", () => {
  it("puts a finished target in achieved whatever its risk", () => {
    expect(targetPace({ overallProgress: 100, riskScore: "high" })).toBe("achieved");
  });

  it("uses the target report's risk score for the rest", () => {
    expect(targetPace({ overallProgress: 60, riskScore: "low" })).toBe("onPace");
    expect(targetPace({ overallProgress: 60, riskScore: "medium" })).toBe("behind");
    expect(targetPace({ overallProgress: 10, riskScore: "high" })).toBe("behind");
  });
});

describe("getHiringFunnel", () => {
  afterEach(() => jest.restoreAllMocks());

  it("turns the aggregate's millisecond means into hours and days, one decimal", async () => {
    jest.spyOn(Application, "aggregate").mockResolvedValueOnce([
      { total: 82, interview: 28, offer: 11, hired: 6, reviewMs: 1_010_288_874.6, hireMs: 150_864_668.4 },
    ] as never);

    await expect(getHiringFunnel()).resolves.toEqual({
      applications: 82,
      reachedInterview: 28,
      reachedOffer: 11,
      hired: 6,
      avgHoursToFirstReview: 280.6,
      avgDaysToHire: 1.7,
    });
  });

  it("reports no averages, not zero, when no application has moved", async () => {
    jest.spyOn(Application, "aggregate").mockResolvedValueOnce([] as never);

    await expect(getHiringFunnel()).resolves.toEqual({
      applications: 0,
      reachedInterview: 0,
      reachedOffer: 0,
      hired: 0,
      avgHoursToFirstReview: null,
      avgDaysToHire: null,
    });
  });
});

describe("health thresholds", () => {
  it("colours each technical check the way the system-health page does", () => {
    expect([databaseStatus(120), databaseStatus(320), databaseStatus(900)]).toEqual(["healthy", "warning", "critical"]);
    expect([emailStatus(0), emailStatus(9), emailStatus(10)]).toEqual(["healthy", "warning", "critical"]);
    expect([webhookStatus(0), webhookStatus(1), webhookStatus(3)]).toEqual(["healthy", "warning", "critical"]);
    expect([lockedAccountsStatus(0), lockedAccountsStatus(2), lockedAccountsStatus(10)]).toEqual(["healthy", "warning", "critical"]);
  });
});

describe("jobsExpiringFilter", () => {
  it("matches active, undeleted jobs closing within the window", () => {
    expect(jobsExpiringFilter(JOB_EXPIRING_WINDOWS["7d"], NOW)).toEqual({
      status: "active",
      deletedAt: null,
      expiresAt: { $gte: NOW, $lte: new Date(NOW.getTime() + 7 * DAY_MS) },
    });
  });
});
