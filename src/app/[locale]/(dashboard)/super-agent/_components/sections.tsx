import { cache } from "react";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AssignedRegionBadge } from "@/components/shared/AssignedRegionBadge";
import { WorkspaceHeader } from "@/components/shared/WorkspaceHeader";
import {
  ActivityTrendPanel,
  CommissionPanel,
  ExhibitionsPanel,
  FunnelPanel,
  PriorityQueuePanel,
  SuperAgentKpiStrip,
  TeamSplitPanel,
  TopAgentsPanel,
  type PriorityItem,
} from "@/components/features/super-agent/dashboard";
import { resolveAssignedRegions } from "@/lib/agents/assignedRegion";
import { localHourIn } from "@/lib/datetime/countryZone";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import {
  loadSuperAgentContext,
  loadSuperAgentFinance,
  loadSuperAgentFunnel,
  loadSuperAgentKpis,
  loadSuperAgentQueue,
  loadSuperAgentTopAgents,
  type SuperAgentDashboardContext,
} from "@/lib/superAgent/dashboardData";
import { SectionFailed } from "./section-states";

export interface SectionContext {
  userId: string;
  userName?: string | null;
  locale: string;
  /** One instant for the whole page, so every section agrees on "today". */
  now: Date;
}

/*
 * Each section runs its own queries and streams in on its own. The scope
 * (team ∪ region, filters, time zone) is resolved once per request through
 * React `cache`, and the parts two sections share (the funnel, the money
 * summary, the queue) are deduplicated the same way, keyed on that context.
 */
const context = cache(async (userId: string, now: Date): Promise<SuperAgentDashboardContext> => {
  await connectDB();
  return loadSuperAgentContext(userId, now);
});
const funnel = cache((ctx: SuperAgentDashboardContext) => loadSuperAgentFunnel(ctx));
const finance = cache((ctx: SuperAgentDashboardContext) => loadSuperAgentFinance(ctx));
const queue = cache((ctx: SuperAgentDashboardContext) => loadSuperAgentQueue(ctx));

async function load<T>(section: string, run: () => Promise<T>): Promise<{ ok: true; data: T } | { ok: false }> {
  try {
    return { ok: true, data: await run() };
  } catch (err) {
    logger.error({ err, section }, "[super-agent/dashboard] section query failed");
    return { ok: false };
  }
}

const hrefFor = (locale: string) => (path: string) => `/${locale}/super-agent${path}`;

/* ── Header: greeting in the SA's own time zone + their assigned region ──── */

export async function HeaderSection({ userId, userName, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("header", async () => {
    const ctx = await context(userId, now);
    // The super-agent's OWN territory, as an admin assigned it — not the union
    // with their agents' regions that scopes the figures.
    const regions = await resolveAssignedRegions(ctx.region, locale);
    return { timeZone: ctx.timeZone, regions };
  });
  const timeZone = result.ok ? result.data.timeZone : "UTC";
  const regions = result.ok ? result.data.regions : [];

  const firstName = userName?.split(" ")[0] || t("hero.fallbackName");
  const hour = localHourIn(timeZone, now);
  const greeting =
    hour < 12 ? t("hero.greetingMorning", { name: firstName }) : hour < 17 ? t("hero.greetingAfternoon", { name: firstName }) : t("hero.greetingEvening", { name: firstName });
  const today = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone }).format(now);

  return (
    <WorkspaceHeader
      title={greeting}
      context={
        <>
          <AssignedRegionBadge regions={regions} className="me-2" />
          {t("hero.subtitle")}
        </>
      }
      actions={
        <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-background/70 px-3 py-1.5 sm:flex">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" />
          <div className="leading-tight">
            <p className="text-[11px] font-medium text-muted-foreground">{t("hero.today")}</p>
            <p className="text-sm font-semibold text-foreground">{today}</p>
          </div>
        </div>
      }
    />
  );
}

/* ── 1. KPI strip ──────────────────────────────────────────────────────── */

export async function KpiSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("kpis", async () => {
    const ctx = await context(userId, now);
    const [kpis, money] = await Promise.all([loadSuperAgentKpis(ctx), finance(ctx)]);
    return { ...kpis, commissions: money.commissions };
  });
  if (!result.ok) return <SectionFailed id="super-agent-kpis" title={t("kpi.title")} message={t("sectionError.message")} />;
  return <SuperAgentKpiStrip kpis={result.data.kpis} daily={result.data.daily} commissions={result.data.commissions} href={hrefFor(locale)} t={t} />;
}

/* ── 2. Priority queue + team activity trend ───────────────────────────── */

export async function QueueSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const href = hrefFor(locale);
  const result = await load("queue", async () => queue(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-priority" title={t("priority.title")} message={t("sectionError.message")} />;
  const q = result.data.queue;

  // Counts, not ratios. Each list page opens pre-filtered to exactly these
  // records, so the number and the destination agree. Most blocking first.
  const items = [
    q.pendingExhibitions > 0 && {
      key: "exhibitions", level: "urgent" as const, count: q.pendingExhibitions,
      title: t("priority.rows.exhibitionsTitle", { count: q.pendingExhibitions }),
      hint: t("priority.exhibitionsAction"), href: href("/exhibitions?status=pending_review"),
    },
    q.pendingCommissions > 0 && {
      key: "commissions", level: "urgent" as const, count: q.pendingCommissions,
      title: t("priority.rows.commissionsTitle", { count: q.pendingCommissions }),
      hint: t("priority.commissionsAction"), href: href("/commissions?status=pending"),
    },
    q.overdueFollowUps > 0 && {
      key: "overdueLeads", level: "soon" as const, count: q.overdueFollowUps,
      title: t("priority.rows.overdueLeadsTitle", { count: q.overdueFollowUps }),
      hint: t("priority.overdueLeadsAction"), href: href("/leads?hasFollowUp=overdue"),
    },
    q.inactiveAgents > 0 && {
      key: "inactiveAgents", level: "review" as const, count: q.inactiveAgents,
      title: t("priority.rows.inactiveAgentsTitle", { count: q.inactiveAgents }),
      hint: t("priority.inactiveAgentsAction"), href: href("/agents?status=inactive"),
    },
    q.idleAgents > 0 && {
      key: "idleAgents", level: "review" as const, count: q.idleAgents,
      title: t("priority.rows.idleAgentsTitle", { count: q.idleAgents }),
      hint: t("priority.idleAgentsAction"), href: href("/agents?performance=no_activity"),
    },
  ].filter(Boolean) as Omit<PriorityItem, "levelLabel">[];
  const rows: PriorityItem[] = items.map((item) => ({ ...item, levelLabel: t(`priority.${item.level}`) }));

  return (
    <PriorityQueuePanel
      id="super-agent-priority"
      items={rows}
      title={t("priority.title")}
      subtitle={rows.length ? t("priority.itemsNeedAction", { count: rows.length }) : t("priority.empty")}
      emptyTitle={t("priority.empty")}
      emptyHint={t("priority.emptyHint")}
    />
  );
}

export async function ActivitySection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("activity", async () => funnel(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-activity" title={t("activity.title")} message={t("sectionError.message")} />;
  return <ActivityTrendPanel activity={result.data.activity} locale={locale} href={hrefFor(locale)} t={t} />;
}

/* ── 3. Funnel, roster split, money ────────────────────────────────────── */

export async function FunnelSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("funnel", async () => funnel(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-funnel" title={t("funnelPanel.title")} message={t("sectionError.message")} />;
  return <FunnelPanel funnel={result.data.funnel} href={hrefFor(locale)} t={t} />;
}

export async function TeamSplitSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("team", async () => queue(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-team-split" title={t("team.title")} message={t("sectionError.message")} />;
  return <TeamSplitPanel team={result.data.team} href={hrefFor(locale)} t={t} />;
}

export async function CommissionSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("commissions", async () => finance(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-commissions" title={t("commission.title")} message={t("sectionError.message")} />;
  return <CommissionPanel commissions={result.data.commissions} href={hrefFor(locale)} t={t} />;
}

/* ── 4. Top agents + exhibitions & targets ─────────────────────────────── */

export async function TopAgentsSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("topAgents", async () => loadSuperAgentTopAgents(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-top-agents" title={t("topAgents.title")} message={t("sectionError.message")} />;
  return <TopAgentsPanel rows={result.data} href={hrefFor(locale)} t={t} />;
}

export async function ExhibitionsSection({ userId, locale, now }: SectionContext) {
  const t = await getTranslations("superAgentDashboard");
  const result = await load("exhibitions", async () => finance(await context(userId, now)));
  if (!result.ok) return <SectionFailed id="super-agent-exhibitions" title={t("exhibitions.title")} message={t("sectionError.message")} />;
  return <ExhibitionsPanel exhibitions={result.data.exhibitions} targets={result.data.targets} href={hrefFor(locale)} t={t} />;
}
