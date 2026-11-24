import { allGaps, cheapGaps, foldMoney, mergeMoney, owedOf, sumByCurrency, workState, latest } from "@/lib/admin/staffReport/rules";
import { parseRange, presetRange, rangeBounds, rangeQuery } from "@/lib/admin/staffReport/range";
import { exportTables, toCsv, type Translate } from "@/lib/admin/staffReport/exportTables";
import type { StaffReport } from "@/lib/admin/staffReport/types";

const NOW = new Date("2026-11-24T10:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("workState (plan v2: working = real work in 30 days, login alone never counts)", () => {
  it("is inactive when the login is switched off, whatever the activity", () => {
    expect(workState(false, daysAgo(1), NOW)).toBe("inactive");
  });
  it("is working with an action inside 30 days", () => {
    expect(workState(true, daysAgo(30), NOW)).toBe("working");
  });
  it("is idle with no action, or only older ones", () => {
    expect(workState(true, null, NOW)).toBe("idle");
    expect(workState(true, daysAgo(31), NOW)).toBe("idle");
  });
  it("latest picks the newest of several dates and ignores blanks", () => {
    expect(latest(null, daysAgo(5), undefined, daysAgo(2))?.toISOString()).toBe(daysAgo(2).toISOString());
    expect(latest(null, undefined)).toBeNull();
  });
});

describe("money", () => {
  it("folds lines per currency, never adding currencies, leaving clawed-back out of totals", () => {
    const rows = foldMoney([
      { currency: "AED", status: "pending", amount: 100 },
      { currency: "AED", status: "paid", amount: 50 },
      { currency: "INR", status: "approved", amount: 1000 },
      { currency: "AED", status: "clawed_back", amount: 999 },
    ]);
    const aed = rows.find((r) => r.currency === "AED")!;
    expect(aed).toMatchObject({ pending: 100, paid: 50, total: 150, count: 3 });
    expect(rows.find((r) => r.currency === "INR")).toMatchObject({ approved: 1000, total: 1000 });
  });
  it("counts pre-grouped rows by n", () => {
    expect(foldMoney([{ currency: "AED", status: "paid", amount: 10, n: 4 }])[0].count).toBe(4);
  });
  it("merges own + team per currency (combined commission view)", () => {
    const own = foldMoney([{ currency: "AED", status: "pending", amount: 10 }]);
    const team = foldMoney([{ currency: "AED", status: "approved", amount: 5 }, { currency: "USD", status: "paid", amount: 7 }]);
    const both = mergeMoney(own, team);
    expect(both.find((m) => m.currency === "AED")).toMatchObject({ pending: 10, approved: 5, total: 15 });
    expect(owedOf(both)).toEqual([{ currency: "AED", amount: 15 }]);
  });
  it("sums amounts per currency", () => {
    expect(sumByCurrency([{ currency: "AED", amount: 1 }, { currency: "AED", amount: 2 }, { currency: null, amount: 3 }]))
      .toEqual([{ currency: "AED", amount: 6 }]);
  });
});

describe("warnings", () => {
  const base = {
    kind: "super_agent" as const, isActive: true, archived: false, hasRegion: true,
    lastLogin: daysAgo(1), overdueTasks: 0, disputedCommission: false, teamSize: 3,
  };
  it("cheap checks catch an inactive, regionless, teamless super agent who never signed in", () => {
    const keys = cheapGaps({ ...base, isActive: false, hasRegion: false, teamSize: 0, lastLogin: null }, NOW).map((g) => g.key);
    expect(keys).toEqual(expect.arrayContaining(["inactiveAccount", "noRegion", "noAgents", "neverLoggedIn"]));
  });
  it("a clean record has no warnings", () => {
    expect(allGaps({ ...base, rate: 5, target: { risk: "low" } as never, workingAgents: { working: 3, total: 3 } }, NOW)).toEqual([]);
  });
  it("flags overdue receivables high and sorts high before medium before low", () => {
    const gaps = allGaps({
      ...base, rate: 0, overdueReceivables: 2, target: null, employersWithoutActiveJob: 1,
      workingAgents: { working: 1, total: 4 },
    }, NOW);
    expect(gaps[0]).toMatchObject({ key: "overdueReceivables", severity: "high", value: 2 });
    expect(gaps.map((g) => g.key)).toEqual(expect.arrayContaining(["noTarget", "noOverrideRate", "mostAgentsIdle"]));
    expect(gaps[gaps.length - 1].severity).toBe("low");
  });
  it("uses the agent's own rate and super-agent link checks for agents", () => {
    const keys = allGaps({ ...base, kind: "agent", teamSize: undefined, rate: 0, hasSuperAgent: false }, NOW).map((g) => g.key);
    expect(keys).toEqual(expect.arrayContaining(["noCommissionRate", "noSuperAgent"]));
    expect(keys).not.toContain("noAgents");
  });
});

describe("date range", () => {
  it("defaults to this year", () => {
    expect(parseRange({}, NOW)).toEqual({ preset: "this_year", from: "2026-01-01", to: "2026-11-24" });
  });
  it("last month covers the whole previous month", () => {
    expect(presetRange("last_month", NOW)).toEqual({ preset: "last_month", from: "2026-10-01", to: "2026-10-31" });
  });
  it("custom range swaps a reversed from/to and rejects bad dates", () => {
    expect(parseRange({ range: "custom", from: "2026-05-10", to: "2026-02-01" }, NOW)).toEqual({ preset: "custom", from: "2026-02-01", to: "2026-05-10" });
    expect(parseRange({ range: "custom", from: "2026-02-31", to: "nope" }, NOW)).toEqual({ preset: "custom", from: null, to: "2026-11-24" });
  });
  it("all time has no lower bound and the upper bound is end of day", () => {
    const b = rangeBounds(parseRange({ range: "all" }, NOW));
    expect(b.from).toBeNull();
    expect(b.to.toISOString()).toBe("2026-11-24T23:59:59.999Z");
  });
  it("round-trips through the query string", () => {
    const r = parseRange({ range: "custom", from: "2026-03-01", to: "2026-03-31" }, NOW);
    const q = new URLSearchParams(rangeQuery(r));
    expect(parseRange({ range: q.get("range"), from: q.get("from"), to: q.get("to") }, NOW)).toEqual(r);
  });
});

describe("export tables", () => {
  const t: Translate = (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k);
  const report = {
    kind: "super_agent", range: { preset: "this_year", from: "2026-01-01", to: "2026-11-24" }, generatedAt: NOW.toISOString(),
    identity: { userId: "u1", name: "Sana", email: "s@x.io", isActive: true, archived: false, regions: ["Kerala, India"] },
    state: "working", lastActivity: null, rate: 2,
    tiles: {
      jobs: { posted: 3, active: 2, closed: 1 }, applications: 9, hires: { hired: 1, placements: 1 },
      invoices: { count: 1, totals: [{ currency: "AED", amount: 500 }] },
      receivables: { due: [], overdue: [], overdueCount: 0 }, subscriptions: { active: 1, employers: 2 },
      exhibitions: { total: 0, byStatus: {} }, workingAgents: { working: 1, total: 2 }, commission: { owed: [], paid: [] },
    },
    funnel: {}, target: null, gaps: [{ key: "noTarget", severity: "medium" }],
    team: [], employers: { rows: [], total: 0 }, jobs: { rows: [], total: 0 },
    invoices: { rows: [{ id: "i", number: "=HYPERLINK(1)", employerName: "Acme, Ltd", agentName: "A", amount: 500, paid: 0, balance: 500, currency: "AED", status: "issued", overdue: false }], total: 1 },
    exhibitions: { rows: [], total: 0 },
    commission: { lines: { rows: [], total: 0 }, own: [], team: [], combined: [] },
    tasks: { open: 0, overdue: 0, rows: { rows: [], total: 0 } },
  } as unknown as StaffReport;

  it("builds one table per tab with the summary first", () => {
    const keys = exportTables(report, t).map((x) => x.key);
    expect(keys[0]).toBe("summary");
    expect(keys).toEqual(expect.arrayContaining(["agents", "employers", "jobs", "invoices", "exhibitions", "commission_totals", "commission_lines", "tasks"]));
  });
  it("CSV quotes commas and neutralises formula cells", () => {
    const inv = exportTables(report, t).find((x) => x.key === "invoices")!;
    const csv = toCsv(inv);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"Acme, Ltd"');
    expect(csv).toContain("'=HYPERLINK(1)");
  });
});
