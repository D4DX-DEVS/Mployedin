/**
 * The profit target report: one shape for every role. An agent's report goes to
 * their super agent, and agent and super-agent reports go to admin, so all three
 * read the same builder. Pure — callers pass enriched profiles, so this module
 * can also be imported for its types by client components.
 */

import type { EnrichedPeriod, EnrichedProfile } from "./profileAchievementCalculator";
import type { ProfitDrivers } from "./profitCalculator";
import { targetPace, type TargetPace } from "./pace";
import { growthOf, targetInsights, type TargetInsights } from "./insights";
import type { PeriodType } from "./schedule";

export interface ReportPerson {
  /** TargetProfile id. */
  profileId: string;
  /** User id of the assignee. */
  userId: string;
  name: string;
  email: string;
  role: "agent" | "super_agent";
  region: string | null;
}

export interface ReportSummary {
  profitTarget: number;
  profitAchieved: number;
  profitPending: number;
  profitProgress: number;
  expectedProgress: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: EnrichedProfile["incentiveTier"];
  pace: TargetPace;
  /** Completion status, growth, forecast and time left. */
  insights: TargetInsights;
}

export interface ReportMonth {
  month: number;
  profitTarget: number;
  profitAchieved: number;
  revenue: number;
  commissionCost: number;
  invoicesPaid: number;
  placements: number;
  newEmployers: number;
}

export interface ReportCategory {
  category: string;
  profit: number;
  /** Share of the person's profit, 0–100. */
  share: number;
}

/** One period of the target's schedule with the profit made inside it. */
export type ReportPeriod = EnrichedPeriod;

export interface TeamRow {
  profileId: string;
  userId: string;
  name: string;
  email: string;
  region: string | null;
  profitTarget: number;
  profitAchieved: number;
  profitProgress: number;
  riskScore: "high" | "medium" | "low";
  incentiveTier: EnrichedProfile["incentiveTier"];
  pace: TargetPace;
  /** Share of the super agent's profit this agent brought in, 0–100. */
  shareOfTeam: number;
}

export interface TeamSection {
  rows: TeamRow[];
  /** Profit that is not one of the listed agents' own: override-line and other income. */
  otherProfit: number;
  /** Target given to agents against the super agent's own target. */
  allocatedTarget: number;
}

export interface TargetReport {
  year: number;
  currency: string;
  person: ReportPerson;
  summary: ReportSummary;
  months: ReportMonth[];
  drivers: ProfitDrivers;
  byCategory: ReportCategory[];
  previousYear: { year: number; profit: number; growthPct: number | null };
  /** How the year is cut up for this target, and how each period is doing. */
  schedule: { periodType: PeriodType; periods: ReportPeriod[] };
  /** Super agents only. */
  team?: TeamSection;
}

export interface NamedProfile {
  profile: EnrichedProfile;
  name: string;
  email: string;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function summaryOf(profile: EnrichedProfile, previousYearProfit: number, now: Date): ReportSummary {
  return {
    profitTarget: profile.profitTarget,
    profitAchieved: profile.profitAchieved,
    profitPending: profile.profitPending,
    profitProgress: profile.profitProgress,
    expectedProgress: profile.expectedProgress,
    riskScore: profile.riskScore,
    incentiveTier: profile.incentiveTier,
    pace: targetPace(profile),
    insights: targetInsights(profile, previousYearProfit, now),
  };
}

export function personOf({ profile, name, email }: NamedProfile): ReportPerson {
  return {
    profileId: profile._id,
    userId: profile.assigneeId,
    name,
    email,
    role: profile.assigneeRole as "agent" | "super_agent",
    region: profile.region ?? null,
  };
}

/** Profit by category with each one's share of the total. */
export function categoriesOf(byCategory: { category: string; profit: number }[]): ReportCategory[] {
  const total = byCategory.reduce((sum, row) => sum + row.profit, 0);
  return byCategory.map((row) => ({
    category: row.category,
    profit: row.profit,
    share: total > 0 ? Math.round((row.profit / total) * 100) : 0,
  }));
}

/** Year-over-year profit, with no growth figure when last year had none to compare against. */
export function previousYearOf(year: number, currentProfit: number, previousProfit: number) {
  return {
    year: year - 1,
    profit: previousProfit,
    growthPct: growthOf(currentProfit, previousProfit).pct,
  };
}

function teamSection(superAgent: EnrichedProfile, team: NamedProfile[]): TeamSection {
  // Agents in another currency are listed but cannot be subtracted from this profit.
  const sameCurrency = team.filter(({ profile }) => profile.currency === superAgent.currency);
  const teamProfit = sameCurrency.reduce((sum, { profile }) => sum + profile.profitAchieved, 0);

  return {
    rows: team
      .map(({ profile, name, email }): TeamRow => ({
        profileId: profile._id,
        userId: profile.assigneeId,
        name,
        email,
        region: profile.region ?? null,
        profitTarget: profile.profitTarget,
        profitAchieved: profile.profitAchieved,
        profitProgress: profile.profitProgress,
        riskScore: profile.riskScore,
        incentiveTier: profile.incentiveTier,
        pace: targetPace(profile),
        shareOfTeam:
          profile.currency === superAgent.currency && superAgent.profitAchieved > 0
            ? Math.round((profile.profitAchieved / superAgent.profitAchieved) * 100)
            : 0,
      }))
      .sort((left, right) => right.profitProgress - left.profitProgress || left.name.localeCompare(right.name)),
    otherProfit: Math.max(0, round2(superAgent.profitAchieved - teamProfit)),
    allocatedTarget: round2(
      sameCurrency.reduce((sum, { profile }) => sum + profile.profitTarget, 0),
    ),
  };
}

/**
 * The report for one profile. Pass the super agent's team to include the team
 * section; `previousYearProfit` is that person's profit the year before, in the
 * same currency.
 */
export function buildTargetReport(input: {
  subject: NamedProfile;
  previousYearProfit: number;
  team?: NamedProfile[];
  now?: Date;
}): TargetReport {
  const { subject, previousYearProfit, team, now = new Date() } = input;
  const { profile } = subject;

  return {
    year: profile.year,
    currency: profile.currency,
    person: personOf(subject),
    summary: summaryOf(profile, previousYearProfit, now),
    months: profile.monthlyAchievements.map((month) => ({
      month: month.month,
      profitTarget: month.profitTarget,
      profitAchieved: month.profitAchieved,
      revenue: month.revenue,
      commissionCost: month.commissionCost,
      invoicesPaid: month.invoicesPaid,
      placements: month.placements,
      newEmployers: month.newEmployers,
    })),
    drivers: profile.drivers,
    byCategory: categoriesOf(profile.byCategory),
    previousYear: previousYearOf(profile.year, profile.profitAchieved, previousYearProfit),
    schedule: { periodType: profile.periodType, periods: profile.periods },
    ...(team ? { team: teamSection(profile, team) } : {}),
  };
}
