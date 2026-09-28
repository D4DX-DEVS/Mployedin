import { getTranslations } from "next-intl/server";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { permittedQueueGroups } from "@/lib/admin/actionQueue";
import { getAdminActionQueue } from "@/lib/admin/actionQueue.server";
import { cachedDashboardSection } from "@/lib/admin/dashboard/cache";
import { getFinanceOverview } from "@/lib/admin/dashboard/finance.server";
import { getHealthChecks } from "@/lib/admin/dashboard/health.server";
import { getDataInsights } from "@/lib/admin/dashboard/insights.server";
import { getPeopleOverview } from "@/lib/admin/dashboard/people.server";
import type { DashboardPeriod } from "@/lib/admin/dashboard/period";
import { getRecentEvents } from "@/lib/admin/dashboard/recent.server";
import { getRecruitmentOverview } from "@/lib/admin/dashboard/recruitment.server";
import { getPlatformSnapshot } from "@/lib/admin/dashboard/snapshot.server";
import { getDashboardTrends } from "@/lib/admin/dashboard/trends.server";
import type { RecentEvent, RecentEventCategory } from "@/lib/admin/dashboard/types";
import type { Resource } from "@/types/user";
import { ActivityTrendPanel } from "./activity-trend";
import { AttentionPanel } from "./attention-panel";
import { InvoicesPanel, RevenuePanel, SubscriptionsPanel } from "./finance-panels";
import { HealthPanel } from "./health-compact";
import { InsightsPanel } from "./insights-panel";
import { KpiStrip, type KpiKey } from "./kpi-strip";
import { AgentOpsPanel, EmployerHealthPanel, UsersByRolePanel } from "./people-panels";
import { AdminRecentActivity, type RecentActivityFilter, type RecentActivityRow } from "./recent-activity";
import { FunnelPanel, JobHealthPanel, PipelinePanel } from "./recruitment-panels";
import { SectionError } from "./section-error";
import { TopEmployersPanel } from "./top-employers";
import type { DashboardTranslator } from "./types";

export interface SectionContext {
  can: (resource: Resource) => boolean;
  period: DashboardPeriod;
  locale: string;
}

/**
 * Runs one section's queries. A failure renders that section's error state
 * with a retry; the sections around it are unaffected.
 */
async function load<T>(section: string, run: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    await connectDB();
    return { ok: true, data: await run() };
  } catch (err) {
    logger.error({ err, section }, "[admin/dashboard] section query failed");
    return { ok: false };
  }
}

function Failed({ id, title, t }: { id: string; title: string; t: DashboardTranslator }) {
  return <SectionError id={id} title={title} message={t("sectionError.message")} retryLabel={t("sectionError.retry")} />;
}

/* ── Shared loaders (React `cache` inside cachedDashboardSection keeps one query per key per TTL) ── */

const trends = (period: DashboardPeriod) => cachedDashboardSection("trends", period.key, () => getDashboardTrends(period));
const snapshot = (period: DashboardPeriod) => cachedDashboardSection("snapshot", period.key, () => getPlatformSnapshot(period));
const recruitment = (period: DashboardPeriod) => cachedDashboardSection("recruitment", period.key, () => getRecruitmentOverview(period));
const people = (period: DashboardPeriod, access: { employers: boolean; agents: boolean }) =>
  cachedDashboardSection("people", `${period.key}:employers-${access.employers ? 1 : 0}:agents-${access.agents ? 1 : 0}`, () => getPeopleOverview(period, access));
const finance = (period: DashboardPeriod, commissions: boolean) =>
  cachedDashboardSection("finance", `${period.key}:commissions-${commissions ? 1 : 0}`, () => getFinanceOverview(period, { commissions }));

/* ── Sections ── */

export async function QueueSection({ can, locale }: SectionContext) {
  const groups = permittedQueueGroups(can);
  if (groups.length === 0) return null;
  const t = await getTranslations("adminDashboard");
  // Never cached: a stale "needs action" list hides work or sends the admin to
  // records that no longer need them. The aggregates below tolerate 60s of age.
  const result = await load("queue", () => getAdminActionQueue(can));
  if (!result.ok) return <Failed id="admin-action-queue" title={t("queue.title")} t={t} />;
  return <AttentionPanel items={result.data} groups={groups} locale={locale} t={t} />;
}

const KPI_RESOURCES: Record<KpiKey, Resource> = {
  users: "users",
  companies: "employers",
  activeJobs: "jobs",
  applications: "applications",
  placements: "placements",
  revenue: "invoices",
};

/** Headline numbers: the five platform totals plus companies and money collected. */
export async function SnapshotSection({ can, period, locale }: SectionContext) {
  const keys = (Object.keys(KPI_RESOURCES) as KpiKey[]).filter((key) => can(KPI_RESOURCES[key]));
  if (keys.length === 0) return null;
  const t = await getTranslations("adminDashboard");
  const wantCompanies = keys.includes("companies");
  const wantRevenue = keys.includes("revenue");
  const result = await load("snapshot", async () => {
    const [snap, tr, ppl, fin] = await Promise.all([
      snapshot(period),
      trends(period),
      wantCompanies ? people(period, { employers: true, agents: can("agents") }) : null,
      wantRevenue ? finance(period, can("commissions")) : null,
    ]);
    const currency = tr.primaryCurrency;
    const monthKey = (d: Date) => d.toISOString().slice(0, 7);
    // Collected in the period vs the period before, from the daily payments the
    // finance overview already sums; revenue rows are monthly so we use the
    // finance "collected" figure for the current window and the same-length
    // window before it is approximated from the monthly series.
    const collectedNow = fin?.money.find((m) => m.currency === (currency ?? fin.money[0]?.currency))?.collected ?? 0;
    const prevStart = period.previousStart;
    const prevMonths = new Set<string>();
    for (let d = new Date(prevStart); d < period.start; d = new Date(d.getTime() + 24 * 60 * 60 * 1000)) prevMonths.add(monthKey(d));
    const collectedPrev = tr.revenue.filter((r) => r.currency === currency && prevMonths.has(r.month)).reduce((s, r) => s + r.collected, 0);
    return {
      snapshot: snap,
      daily: tr.daily,
      companies: ppl?.employers ? { total: ppl.employers.companies, added: { current: ppl.employers.newCompaniesInPeriod, previous: 0 } } : null,
      revenue: fin ? { currency: currency ?? fin.money[0]?.currency ?? "AED", current: collectedNow, previous: collectedPrev } : null,
    };
  });
  if (!result.ok) return <Failed id="admin-snapshot" title={t("snapshot.title")} t={t} />;
  return <KpiStrip data={result.data} keys={keys} days={period.days} locale={locale} t={t} />;
}

export async function TrendSection({ can, period, locale }: SectionContext) {
  const show = { users: can("users"), jobs: can("jobs"), applications: can("applications") };
  if (!show.users && !show.jobs && !show.applications) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("trends", () => trends(period));
  if (!result.ok) return <Failed id="admin-trend" title={t("trends.title")} t={t} />;
  return <ActivityTrendPanel daily={result.data.daily} show={show} days={period.days} locale={locale} t={t} />;
}

export async function RecruitmentSection({ can, period, locale }: SectionContext) {
  const show = { applications: can("applications"), jobs: can("jobs") };
  if (!show.applications && !show.jobs) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("recruitment", () => recruitment(period));
  if (!result.ok) return <Failed id="admin-recruitment" title={t("recruitment.title")} t={t} />;
  const props = { data: result.data, show, days: period.days, locale, t };
  return (
    <>
      {show.applications && <FunnelPanel {...props} />}
      {show.applications && <PipelinePanel {...props} />}
      {show.jobs && <JobHealthPanel {...props} />}
    </>
  );
}

export async function PeopleSection({ can, period, locale }: SectionContext) {
  const access = { employers: can("employers"), agents: can("agents") };
  const showRoles = can("users");
  if (!showRoles && !access.employers && !access.agents) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("people", () => people(period, access));
  if (!result.ok) return <Failed id="admin-people" title={t("people.title")} t={t} />;
  const props = { data: result.data, showRoles, days: period.days, locale, t };
  return (
    <>
      {showRoles && <UsersByRolePanel {...props} />}
      {access.employers && <EmployerHealthPanel {...props} />}
      {access.agents && <AgentOpsPanel {...props} />}
    </>
  );
}

export async function TopEmployersSection({ can, period, locale }: SectionContext) {
  if (!can("employers") || !can("applications")) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("trends", () => trends(period));
  if (!result.ok) return <Failed id="admin-top-employers" title={t("topEmployers.title")} t={t} />;
  return <TopEmployersPanel employers={result.data.topEmployers} days={period.days} locale={locale} t={t} />;
}

export async function RevenueSection({ can, period, locale }: SectionContext) {
  if (!can("invoices")) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("trends", () => trends(period));
  if (!result.ok) return <Failed id="admin-revenue" title={t("revenue.title")} t={t} />;
  return <RevenuePanel revenue={result.data.revenue} currency={result.data.primaryCurrency} now={period.now} locale={locale} t={t} />;
}

export async function FinanceSection({ can, period, locale }: SectionContext) {
  const show = { invoices: can("invoices"), subscriptions: can("subscriptions") };
  if (!show.invoices && !show.subscriptions) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("finance", () => finance(period, can("commissions")));
  if (!result.ok) return <Failed id="admin-finance" title={t("finance.title")} t={t} />;
  const props = { data: result.data, show, days: period.days, locale, t };
  return (
    <>
      {show.invoices && <InvoicesPanel {...props} />}
      {show.subscriptions && <SubscriptionsPanel {...props} />}
    </>
  );
}

export async function InsightsSection({ can, period, locale }: SectionContext) {
  if (!can("users") && !can("jobs") && !can("employers")) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("insights", () => cachedDashboardSection("insights", period.key, () => getDataInsights(period)));
  if (!result.ok) return <Failed id="admin-insights" title={t("insights.title")} t={t} />;
  return <InsightsPanel insights={result.data} locale={locale} t={t} />;
}

/** The same permission as the full system-health page. */
export async function HealthSection({ can, period, locale }: SectionContext) {
  if (!can("audit_logs")) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("health", () => cachedDashboardSection("health", period.key, () => getHealthChecks(period)));
  if (!result.ok) return <Failed id="admin-health" title={t("health.title")} t={t} />;
  return <HealthPanel checks={result.data} locale={locale} t={t} />;
}

const CATEGORY_RESOURCES: Record<RecentEventCategory, Resource> = {
  users: "users",
  jobs: "jobs",
  applications: "applications",
  finance: "invoices",
  system: "audit_logs",
};

const ROLE_KEYS: Record<string, string> = {
  admin: "admin",
  super_agent: "superAgent",
  agent: "agent",
  employer: "employer",
  job_seeker: "jobSeeker",
};

const STATUS_KEYS: Record<string, string> = {
  active: "active",
  draft: "draft",
  paused: "paused",
  closed: "closed",
  expired: "expired",
  applied: "applied",
  shortlisted: "shortlisted",
  interview_scheduled: "interviewScheduled",
  selected: "selected",
  offer: "offer",
  hired: "hired",
  rejected: "rejected",
  withdrawn: "withdrawn",
};

const SYSTEM_ACTION_KEYS: Record<string, string> = {
  "settings.update": "settingsUpdate",
  "user.create": "userCreate",
  "user.delete": "userDelete",
  "user.deactivate": "userDeactivate",
  "impersonation.start": "impersonationStart",
  "gdpr.export": "gdprExport",
};

function eventPath(event: RecentEvent): string {
  switch (event.kind) {
    case "user":
      return event.subject ? `/admin/users?search=${encodeURIComponent(event.subject)}` : "/admin/users";
    case "job":
      return event.subject ? `/admin/jobs?search=${encodeURIComponent(event.subject)}` : "/admin/jobs";
    case "application":
      return event.status ? `/admin/applications?status=${event.status}` : "/admin/applications";
    case "interview":
      return "/admin/interviews";
    case "placement":
      return "/admin/placements";
    case "invoice_issued":
    case "invoice_paid":
      return "/admin/invoices";
    case "subscription_started":
      return "/admin/subscriptions";
    case "system":
      return event.action ? `/admin/audit-logs?action=${encodeURIComponent(event.action)}` : "/admin/audit-logs";
  }
}

/** "2 hours ago" for the feed; the exact time goes in the tooltip. */
function timeAgo(at: string, now: Date, locale: string, t: DashboardTranslator): string {
  const minutes = Math.round((now.getTime() - Date.parse(at)) / 60_000);
  if (minutes < 1) return t("recent.justNow");
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 30) return format.format(-days, "day");
  return format.format(-Math.round(days / 30), "month");
}

function recentRows(events: readonly RecentEvent[], now: Date, locale: string, t: DashboardTranslator): RecentActivityRow[] {
  const statusLabel = (status?: string) => t(`statuses.${STATUS_KEYS[status ?? ""] ?? "unknown"}`);
  const titleFor = (event: RecentEvent): string => {
    switch (event.kind) {
      case "user":
        return t("recent.userJoined", { name: event.subject || t("recent.someone"), role: t(`roles.${ROLE_KEYS[event.role ?? ""] ?? "unknown"}`) });
      case "job":
        return t("recent.jobPosted", { title: event.subject || t("recent.untitledJob") });
      case "application": {
        const base =
          event.status === "applied" ? t("recent.applicationNew") : t("recent.applicationMoved", { status: statusLabel(event.status) });
        return event.subject ? `${base} — ${event.subject}` : base;
      }
      case "interview":
        return event.subject ? `${t("recent.interviewScheduled")} — ${event.subject}` : t("recent.interviewScheduled");
      case "placement":
        return event.subject ? `${t("recent.placementClosed")} — ${event.subject}` : t("recent.placementClosed");
      case "invoice_issued":
        return t("recent.invoiceIssued", { number: event.subject || "—" });
      case "invoice_paid":
        return t("recent.invoicePaid", { number: event.subject || "—" });
      case "subscription_started":
        return t("recent.subscriptionStarted", { plan: event.subject || t("recent.unknownPlan") });
      case "system":
        return t(`recent.system.${SYSTEM_ACTION_KEYS[event.action ?? ""] ?? "other"}`, { name: event.subject || t("recent.someone") });
    }
  };

  return events.map((event) => ({
    id: event.id,
    kind: event.kind,
    category: event.category,
    title: titleFor(event),
    meta: event.kind === "job" && event.status ? statusLabel(event.status) : undefined,
    at: event.at,
    ago: timeAgo(event.at, now, locale, t),
    dateLabel: new Date(event.at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    href: `/${locale}${eventPath(event)}`,
  }));
}

export async function RecentSection({ can, period, locale }: SectionContext) {
  const categories = (Object.keys(CATEGORY_RESOURCES) as RecentEventCategory[]).filter((category) => can(CATEGORY_RESOURCES[category]));
  if (categories.length === 0) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("recent", () => cachedDashboardSection("recent", categories.join(","), () => getRecentEvents(new Set(categories))));
  if (!result.ok) return <Failed id="admin-recent" title={t("recent.title")} t={t} />;
  const filters: RecentActivityFilter[] = ["all", ...categories];

  return (
    <AdminRecentActivity
      rows={recentRows(result.data, period.now, locale, t)}
      filters={filters.map((value) => ({ value, label: t(`recent.filters.${value}`) }))}
      labels={{
        title: t("recent.title"),
        description: t("recent.description"),
        empty: t("recent.empty"),
        emptyFiltered: t("recent.emptyFiltered"),
        viewAll: t("recent.viewAll"),
        filterGroup: t("recent.filterGroup"),
      }}
      viewAllHref={can("audit_logs") ? `/${locale}/admin/activity-timeline` : null}
    />
  );
}
