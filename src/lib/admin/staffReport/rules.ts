import type { GapSeverity, Money, MoneyByStatus, ReportGap, StaffKind, TargetSummary, WorkState } from "./types";

/**
 * Pure rules behind the report: the working-agent test, money totals and the
 * warnings list (plan v2 → "Warnings, commission and counting rules").
 * Kept free of the database so they are unit-tested directly.
 */

export const WORK_WINDOW_DAYS = 30;
const DAY = 86_400_000;

/** Working = real work (job posted, candidate moved, logged action) within the window. Login alone never counts. */
export function workState(isActive: boolean, lastActivity: Date | string | null | undefined, now: Date = new Date()): WorkState {
  if (!isActive) return "inactive";
  if (!lastActivity) return "idle";
  const t = new Date(lastActivity).getTime();
  return now.getTime() - t <= WORK_WINDOW_DAYS * DAY ? "working" : "idle";
}

/** The latest of several optional dates. */
export function latest(...dates: Array<Date | string | null | undefined>): Date | null {
  let best: number | null = null;
  for (const d of dates) {
    if (!d) continue;
    const t = new Date(d).getTime();
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best === null ? null : new Date(best);
}

export function emptyMoneyByStatus(currency: string): MoneyByStatus {
  return { currency, pending: 0, approved: 0, paid: 0, disputed: 0, total: 0, count: 0 };
}

/** Fold commission lines into per-currency status totals. Clawed-back lines are counted, never summed. */
export function foldMoney(lines: Array<{ currency?: string | null; status: string; amount: number; n?: number }>): MoneyByStatus[] {
  const by = new Map<string, MoneyByStatus>();
  for (const l of lines) {
    const cur = l.currency || "AED";
    const m = by.get(cur) ?? emptyMoneyByStatus(cur);
    if (l.status === "pending" || l.status === "approved" || l.status === "paid" || l.status === "disputed") {
      m[l.status] += l.amount;
      m.total += l.amount;
    }
    // `n` = how many lines a pre-grouped row stands for.
    m.count += l.n ?? 1;
    by.set(cur, m);
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

/** Add per-currency status totals together (never across currencies). */
export function mergeMoney(...sets: MoneyByStatus[][]): MoneyByStatus[] {
  const by = new Map<string, MoneyByStatus>();
  for (const set of sets) {
    for (const m of set) {
      const acc = by.get(m.currency) ?? emptyMoneyByStatus(m.currency);
      acc.pending += m.pending;
      acc.approved += m.approved;
      acc.paid += m.paid;
      acc.disputed += m.disputed;
      acc.total += m.total;
      acc.count += m.count;
      by.set(m.currency, acc);
    }
  }
  return [...by.values()].sort((a, b) => b.total - a.total);
}

export function owedOf(rows: MoneyByStatus[]): Money[] {
  return rows.filter((r) => r.pending + r.approved > 0).map((r) => ({ currency: r.currency, amount: r.pending + r.approved }));
}

export function paidOf(rows: MoneyByStatus[]): Money[] {
  return rows.filter((r) => r.paid > 0).map((r) => ({ currency: r.currency, amount: r.paid }));
}

/** Sum amounts per currency. */
export function sumByCurrency(items: Array<{ currency?: string | null; amount: number }>): Money[] {
  const by = new Map<string, number>();
  for (const i of items) {
    const cur = i.currency || "AED";
    by.set(cur, (by.get(cur) ?? 0) + i.amount);
  }
  return [...by.entries()].filter(([, a]) => a !== 0).map(([currency, amount]) => ({ currency, amount })).sort((a, b) => b.amount - a.amount);
}

/** The facts the warnings are judged on. Optional facts are skipped when absent. */
export interface GapFacts {
  kind: StaffKind;
  isActive: boolean;
  archived: boolean;
  hasRegion: boolean;
  lastLogin: Date | string | null | undefined;
  overdueTasks: number;
  disputedCommission: boolean;
  /** Super agents: number of agents in the team. */
  teamSize?: number;
  // ── Full report only ──
  overdueReceivables?: number;
  target?: TargetSummary | null;
  workingAgents?: { working: number; total: number };
  employers?: number;
  jobsPostedInRange?: number;
  activeJobs?: number;
  applicationsLast30?: number;
  approvedUnpaid?: boolean;
  stalePendingCommission?: number;
  hasSuperAgent?: boolean;
  rate?: number;
  agentsWithoutRegion?: number;
  subscriptionsEndingSoon?: number;
  employersWithoutSubscription?: number;
  employersWithoutActiveJob?: number;
  applicationsTotal?: number;
  hiresTotal?: number;
}

const ORDER: Record<GapSeverity, number> = { high: 0, medium: 1, low: 2 };

/**
 * The cheap checks (★ in the plan): one profile read each, so the lists can
 * show a warnings badge for a whole page at once.
 */
export function cheapGaps(f: GapFacts, now: Date = new Date()): ReportGap[] {
  const g: ReportGap[] = [];
  if (!f.isActive) g.push({ key: "inactiveAccount", severity: "high" });
  if (f.archived) g.push({ key: "archivedRole", severity: "high" });
  if (!f.hasRegion) g.push({ key: "noRegion", severity: "high" });
  if (f.kind === "super_agent" && f.teamSize === 0) g.push({ key: "noAgents", severity: "high" });
  if (f.overdueTasks > 0) g.push({ key: "overdueTasks", severity: "high", value: f.overdueTasks });
  if (f.disputedCommission) g.push({ key: "disputedCommission", severity: "high" });
  if (!f.lastLogin) g.push({ key: "neverLoggedIn", severity: "medium" });
  else if (now.getTime() - new Date(f.lastLogin).getTime() > 30 * DAY) g.push({ key: "noLogin30", severity: "medium" });
  return g;
}

export function allGaps(f: GapFacts, now: Date = new Date()): ReportGap[] {
  const g = cheapGaps(f, now);
  const sa = f.kind === "super_agent";
  if ((f.overdueReceivables ?? 0) > 0) g.push({ key: "overdueReceivables", severity: "high", value: f.overdueReceivables });
  if (f.target === null) g.push({ key: "noTarget", severity: "medium" });
  else if (f.target?.risk === "high") g.push({ key: "targetHighRisk", severity: "high" });
  else if (f.target?.risk === "medium") g.push({ key: "targetBehind", severity: "medium" });
  if (sa && f.workingAgents && f.workingAgents.total > 0 && f.workingAgents.working * 2 < f.workingAgents.total) {
    g.push({ key: "mostAgentsIdle", severity: "medium", value: f.workingAgents.total - f.workingAgents.working });
  }
  if ((f.employers ?? 0) > 0 && f.jobsPostedInRange === 0) g.push({ key: "noJobsInRange", severity: "medium" });
  if ((f.activeJobs ?? 0) > 0 && f.applicationsLast30 === 0) g.push({ key: "noApplications30", severity: "medium" });
  if (f.approvedUnpaid) g.push({ key: "approvedUnpaid", severity: "medium" });
  if ((f.stalePendingCommission ?? 0) > 0) g.push({ key: "stalePendingCommission", severity: "medium", value: f.stalePendingCommission });
  if (!sa && f.hasSuperAgent === false) g.push({ key: "noSuperAgent", severity: "medium" });
  if (f.rate !== undefined && !(f.rate > 0)) g.push({ key: sa ? "noOverrideRate" : "noCommissionRate", severity: "medium" });
  if (sa && (f.agentsWithoutRegion ?? 0) > 0) g.push({ key: "agentsNoRegion", severity: "medium", value: f.agentsWithoutRegion });
  if ((f.subscriptionsEndingSoon ?? 0) > 0) g.push({ key: "subscriptionsEndingSoon", severity: "medium", value: f.subscriptionsEndingSoon });
  if ((f.employersWithoutSubscription ?? 0) > 0) g.push({ key: "employersNoSubscription", severity: "low", value: f.employersWithoutSubscription });
  if ((f.employersWithoutActiveJob ?? 0) > 0) g.push({ key: "employersNoActiveJob", severity: "low", value: f.employersWithoutActiveJob });
  if ((f.applicationsTotal ?? 0) > 0 && f.hiresTotal === 0) g.push({ key: "noHires", severity: "low" });
  return sortGaps(g);
}

export function sortGaps(g: ReportGap[]): ReportGap[] {
  return [...g].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
