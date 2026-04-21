/**
 * @jest-environment node
 */
import {
  calcEndDate,
  nextUsageReset,
  initAiUsage,
  buildPlanSnapshot,
  tierToLegacyType,
} from "@/lib/subscription/helpers";

// ── calcEndDate ──────────────────────────────────────────────────────────────

describe("calcEndDate", () => {
  const start = new Date("2026-01-15T00:00:00Z");

  test("monthly adds 30 days", () => {
    const end = calcEndDate(start, "monthly");
    const diff = end.getTime() - start.getTime();
    expect(diff).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("quarterly adds 91 days", () => {
    const end = calcEndDate(start, "quarterly");
    const diff = end.getTime() - start.getTime();
    expect(diff).toBe(91 * 24 * 60 * 60 * 1000);
  });

  test("yearly adds 365 days", () => {
    const end = calcEndDate(start, "yearly");
    const diff = end.getTime() - start.getTime();
    expect(diff).toBe(365 * 24 * 60 * 60 * 1000);
  });

  test("unknown cycle defaults to monthly", () => {
    const end = calcEndDate(start, "biweekly");
    const diff = end.getTime() - start.getTime();
    expect(diff).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test("returns a Date object", () => {
    expect(calcEndDate(start, "monthly")).toBeInstanceOf(Date);
  });
});

// ── nextUsageReset ───────────────────────────────────────────────────────────

describe("nextUsageReset", () => {
  test("mid-January → Feb 1", () => {
    const from = new Date("2026-01-15T12:30:00Z");
    const reset = nextUsageReset(from);
    expect(reset.getUTCFullYear()).toBe(2026);
    expect(reset.getUTCMonth()).toBe(1); // February
    expect(reset.getUTCDate()).toBe(1);
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getUTCMinutes()).toBe(0);
  });

  test("December → Jan 1 of next year", () => {
    const from = new Date("2026-12-20T00:00:00Z");
    const reset = nextUsageReset(from);
    expect(reset.getUTCFullYear()).toBe(2027);
    expect(reset.getUTCMonth()).toBe(0); // January
    expect(reset.getUTCDate()).toBe(1);
  });

  test("returns midnight UTC", () => {
    const reset = nextUsageReset(new Date("2026-06-15T18:45:30Z"));
    expect(reset.getUTCHours()).toBe(0);
    expect(reset.getUTCMinutes()).toBe(0);
    expect(reset.getUTCSeconds()).toBe(0);
    expect(reset.getUTCMilliseconds()).toBe(0);
  });
});

// ── initAiUsage ──────────────────────────────────────────────────────────────

describe("initAiUsage", () => {
  test("returns object with all 15 AI feature keys", () => {
    const usage = initAiUsage();
    const keys = Object.keys(usage);
    expect(keys.length).toBe(15);
    expect(keys).toContain("ai_chat");
    expect(keys).toContain("ai_daily_insights");
    expect(keys).toContain("ai_job_matching");
    expect(keys).toContain("ai_cv_extraction");
    expect(keys).toContain("ai_generate_summary");
  });

  test("all values are 0", () => {
    const usage = initAiUsage();
    for (const val of Object.values(usage)) {
      expect(val).toBe(0);
    }
  });

  test("returns a new object each time", () => {
    const a = initAiUsage();
    const b = initAiUsage();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ── buildPlanSnapshot ────────────────────────────────────────────────────────

describe("buildPlanSnapshot", () => {
  const mockPlan = {
    name: "Gold",
    tier: 2,
    price: 99,
    currency: "AED",
    billingCycle: "monthly",
    employerLimits: { maxActiveJobs: 10, aiFeatures: [] },
    jobSeekerLimits: undefined,
  } as never;

  test("copies core fields", () => {
    const snap = buildPlanSnapshot(mockPlan);
    expect(snap.name).toBe("Gold");
    expect(snap.tier).toBe(2);
    expect(snap.price).toBe(99);
    expect(snap.currency).toBe("AED");
    expect(snap.billingCycle).toBe("monthly");
  });

  test("deep-clones employerLimits", () => {
    const snap = buildPlanSnapshot(mockPlan);
    expect(snap.employerLimits).toBeDefined();
    expect(snap.employerLimits).toEqual({ maxActiveJobs: 10, aiFeatures: [] });
    // Ensure it's a deep copy
    expect(snap.employerLimits).not.toBe((mockPlan as unknown as Record<string, unknown>).employerLimits);
  });

  test("handles missing jobSeekerLimits", () => {
    const snap = buildPlanSnapshot(mockPlan);
    expect(snap.jobSeekerLimits).toBeUndefined();
  });

  test("deep-clones jobSeekerLimits when present", () => {
    const planWithJS = {
      ...(mockPlan as unknown as Record<string, unknown>),
      jobSeekerLimits: { maxApplicationsPerMonth: 20, aiFeatures: [] },
    } as never;
    const snap = buildPlanSnapshot(planWithJS);
    expect(snap.jobSeekerLimits).toEqual({ maxApplicationsPerMonth: 20, aiFeatures: [] });
  });
});

// ── tierToLegacyType ─────────────────────────────────────────────────────────

describe("tierToLegacyType", () => {
  test("tier 0 → basic", () => {
    expect(tierToLegacyType(0)).toBe("basic");
  });

  test("tier 1 → basic", () => {
    expect(tierToLegacyType(1)).toBe("basic");
  });

  test("tier 2 → premium", () => {
    expect(tierToLegacyType(2)).toBe("premium");
  });

  test("tier 3 → premium", () => {
    expect(tierToLegacyType(3)).toBe("premium");
  });

  test("tier 10 → premium", () => {
    expect(tierToLegacyType(10)).toBe("premium");
  });
});
