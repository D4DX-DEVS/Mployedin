import { getTranslations } from "next-intl/server";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { permittedQueueGroups } from "@/lib/admin/actionQueue";
import { getAdminActionQueue } from "@/lib/admin/actionQueue.server";
import { cachedDashboardSection } from "@/lib/admin/dashboard/cache";
import { getFinanceOverview } from "@/lib/admin/dashboard/finance.server";
import { getHealthChecks } from "@/lib/admin/dashboard/health.server";
import { getPeopleOverview } from "@/lib/admin/dashboard/people.server";
import type { DashboardPeriod } from "@/lib/admin/dashboard/period";
import { getRecentEvents } from "@/lib/admin/dashboard/recent.server";
import { getRecruitmentOverview } from "@/lib/admin/dashboard/recruitment.server";
import { getPlatformSnapshot } from "@/lib/admin/dashboard/snapshot.server";
import type { RecentEvent, RecentEventCategory } from "@/lib/admin/dashboard/types";
import type { Resource } from "@/types/user";
import { AdminActionQueue } from "./action-queue";
import { AdminFinanceOverview } from "./finance-overview";
import { AdminHealthPanel } from "./health-panel";
import { AdminPeopleOverview } from "./people-overview";
import { AdminPlatformSnapshot, type SnapshotKey } from "./platform-snapshot";
import { AdminRecentActivity, type RecentActivityFilter, type RecentActivityRow } from "./recent-activity";
import { AdminRecruitmentOverview } from "./recruitment-overview";
import { SectionError } from "./section-error";
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

export async function QueueSection({ can, locale }: SectionContext) {
  const groups = permittedQueueGroups(can);
  if (groups.length === 0) return null;
  const t = await getTranslations("adminDashboard");
  // Never cached: a stale "needs action" list hides work or sends the admin to
  // records that no longer need them. The aggregates below tolerate 60s of age.
  const result = await load("queue", () => getAdminActionQueue(can));
  if (!result.ok) return <Failed id="admin-action-queue" title={t("queue.title")} t={t} />;
  return <AdminActionQueue items={result.data} groups={groups} locale={locale} t={t} />;
}

const SNAPSHOT_RESOURCES: Record<SnapshotKey, Resource> = {
  users: "users",
  activeJobs: "jobs",
  applications: "applications",
  interviews: "interviews",
  placements: "placements",
};

export async function SnapshotSection({ can, period, locale }: SectionContext) {
  const keys = (Object.keys(SNAPSHOT_RESOURCES) as SnapshotKey[]).filter((key) => can(SNAPSHOT_RESOURCES[key]));
  if (keys.length === 0) return null;
  const t = await getTranslations("adminDashboard");
  // Data is permission-independent here; `keys` only filters rendering.
  const result = await load("snapshot", () => cachedDashboardSection("snapshot", period.key, () => getPlatformSnapshot(period)));
  if (!result.ok) return <Failed id="admin-snapshot" title={t("snapshot.title")} t={t} />;
  return <AdminPlatformSnapshot data={result.data} keys={keys} days={period.days} locale={locale} t={t} />;
}

export async function RecruitmentSection({ can, period, locale }: SectionContext) {
  const show = { applications: can("applications"), jobs: can("jobs") };
  if (!show.applications && !show.jobs) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("recruitment", () => cachedDashboardSection("recruitment", period.key, () => getRecruitmentOverview(period)));
  if (!result.ok) return <Failed id="admin-recruitment" title={t("recruitment.title")} t={t} />;
  return <AdminRecruitmentOverview data={result.data} show={show} days={period.days} locale={locale} t={t} />;
}

export async function PeopleSection({ can, period, locale }: SectionContext) {
  const access = { employers: can("employers"), agents: can("agents") };
  const showRoles = can("users");
  if (!showRoles && !access.employers && !access.agents) return null;
  const t = await getTranslations("adminDashboard");
  // The employer/agent panels differ by permission, so the flags are in the key.
  const key = `${period.key}:employers-${access.employers ? 1 : 0}:agents-${access.agents ? 1 : 0}`;
  const result = await load("people", () => cachedDashboardSection("people", key, () => getPeopleOverview(period, access)));
  if (!result.ok) return <Failed id="admin-people" title={t("people.title")} t={t} />;
  return <AdminPeopleOverview data={result.data} showRoles={showRoles} days={period.days} locale={locale} t={t} />;
}

export async function FinanceSection({ can, period, locale }: SectionContext) {
  const show = { invoices: can("invoices"), subscriptions: can("subscriptions") };
  const commissions = can("commissions");
  if (!show.invoices && !show.subscriptions && !commissions) return null;
  const t = await getTranslations("adminDashboard");
  const key = `${period.key}:commissions-${commissions ? 1 : 0}`;
  const result = await load("finance", () => cachedDashboardSection("finance", key, () => getFinanceOverview(period, { commissions })));
  if (!result.ok) return <Failed id="admin-finance" title={t("finance.title")} t={t} />;
  return <AdminFinanceOverview data={result.data} show={show} days={period.days} locale={locale} t={t} />;
}

/** The same permission as the full system-health page. */
export async function HealthSection({ can, period, locale }: SectionContext) {
  if (!can("audit_logs")) return null;
  const t = await getTranslations("adminDashboard");
  const result = await load("health", () => cachedDashboardSection("health", period.key, () => getHealthChecks(period)));
  if (!result.ok) return <Failed id="admin-health" title={t("health.title")} t={t} />;
  return <AdminHealthPanel checks={result.data} locale={locale} t={t} />;
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
        // Subject is "Name · Job title" (see recent.server); appending keeps rows distinct without new keys.
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
  // Only readable categories are ever queried, so they are the cache key.
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
