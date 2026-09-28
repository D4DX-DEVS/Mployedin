import { Suspense } from "react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Briefcase, FileUp, Megaphone, ReceiptText, UserPlus } from "lucide-react";
import { QuickActions, type QuickAction } from "@/components/shared/DashboardKit";
import { DASHBOARD_PERIODS, resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { canAccess } from "@/lib/permissions/matrix";
import type { CustomPermissions, PermissionMode, Resource, UserRole } from "@/types/user";
import { DashboardToolbar } from "./_components/dashboard-toolbar";
import { KpiStripSkeleton, PanelSkeleton } from "./_components/section-states";
import {
  FinanceSection,
  HealthSection,
  InsightsSection,
  PeopleSection,
  QueueSection,
  RecentSection,
  RecruitmentSection,
  RevenueSection,
  SnapshotSection,
  TopEmployersSection,
  TrendSection,
  type SectionContext,
} from "./_components/sections";

/*
 * Admin dashboard: one scrollable page, ordered by what an admin opens it for.
 *
 *   1. headline numbers with the period's trend baked in (sparklines);
 *   2. activity over time next to what is waiting on a decision;
 *   3. recruitment: funnel, pipeline by status, job health;
 *   4. money: collected per month, invoices, subscriptions, top employers;
 *   5. people: users by role, employer health, agent operations;
 *   6. quick findings (data gaps worth a nudge) and system health;
 *   7. the recent activity feed.
 *
 * Every figure is counted from stored data. Each section streams in on its own
 * so one slow query never holds up the rest, and each is gated by the same
 * permission matrix the APIs behind its destination pages enforce.
 */
export default async function AdminDashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string | string[]; tab?: string | string[] }>;
}) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminDashboard");

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  const { period: periodParam } = await searchParams;
  const period = resolveDashboardPeriod(Array.isArray(periodParam) ? periodParam[0] : periodParam);

  // Custom permissions can narrow an admin; every section asks the same matrix
  // the APIs behind its destination pages enforce.
  const user = session.user as unknown as {
    role?: UserRole;
    name?: string | null;
    permissionMode?: PermissionMode;
    customPermissions?: CustomPermissions;
  };
  const can = (resource: Resource) =>
    Boolean(user.role) &&
    canAccess(user.role as UserRole, resource, "read", {
      permissionMode: user.permissionMode,
      customPermissions: user.customPermissions,
    });
  const context: SectionContext = { can, period, locale };

  const now = period.now;
  const updatedLabel = t("hero.updated", {
    time: now.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
  const loading = (section: string) => t("sectionLoading", { section });
  const p = (path: string) => `/${locale}${path}`;

  const quickActions: QuickAction[] = [
    can("jobs") && { key: "postJob", label: t("quickActions.postJob"), href: p("/admin/jobs/new"), icon: Briefcase, primary: true },
    can("users") && { key: "addUser", label: t("quickActions.addUser"), href: p("/admin/users?new=1"), icon: UserPlus },
    can("invoices") && { key: "createInvoice", label: t("quickActions.createInvoice"), href: p("/admin/invoices/new"), icon: ReceiptText },
    can("users") && { key: "broadcast", label: t("quickActions.broadcast"), href: p("/admin/communications"), icon: Megaphone },
    can("users") && { key: "bulkImport", label: t("quickActions.bulkImport"), href: p("/admin/bulk-import"), icon: FileUp },
  ].filter(Boolean) as QuickAction[];

  return (
    <div className="page-container dashboard-overview-page space-y-4">
      {/* Header: title, period + refresh, quick actions. */}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{t("hero.title")}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("hero.subtitle", { days: period.days })}</p>
          </div>
          <DashboardToolbar
            updatedLabel={updatedLabel}
            updatedAt={now.toISOString()}
            labels={{
              refresh: t("toolbar.refresh"),
              refreshing: t("toolbar.refreshing"),
              period: t("toolbar.period"),
              periods: Object.fromEntries(DASHBOARD_PERIODS.map((key) => [key, t(`toolbar.periods.${key}`)])) as Record<
                (typeof DASHBOARD_PERIODS)[number],
                string
              >,
            }}
          />
        </div>
        {quickActions.length > 0 && <QuickActions actions={quickActions} ariaLabel={t("quickActions.label")} />}
      </header>

      {/* 1. Headline numbers */}
      <Suspense key={`snapshot-${period.key}`} fallback={<KpiStripSkeleton label={loading(t("snapshot.title"))} />}>
        <SnapshotSection {...context} />
      </Suspense>

      {/* 2. Activity trend + what needs action */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <Suspense key={`trend-${period.key}`} fallback={<PanelSkeleton label={loading(t("trends.title"))} rows={7} className="h-full" />}>
            <TrendSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-4">
          <Suspense fallback={<PanelSkeleton label={loading(t("queue.title"))} rows={7} className="h-full" />}>
            <QueueSection {...context} />
          </Suspense>
        </div>
      </div>

      {/* 3. Recruitment */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense
          key={`recruitment-${period.key}`}
          fallback={
            <>
              <PanelSkeleton label={loading(t("funnel.title"))} />
              <PanelSkeleton label={loading(t("recruitment.pipelineTitle"))} />
              <PanelSkeleton label={loading(t("jobHealth.title"))} />
            </>
          }
        >
          <RecruitmentSection {...context} />
        </Suspense>
      </div>

      {/* 4. Money */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Suspense key={`revenue-${period.key}`} fallback={<PanelSkeleton label={loading(t("revenue.title"))} rows={6} className="h-full" />}>
            <RevenueSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-5">
          <Suspense key={`top-${period.key}`} fallback={<PanelSkeleton label={loading(t("topEmployers.title"))} rows={6} className="h-full" />}>
            <TopEmployersSection {...context} />
          </Suspense>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense
          key={`finance-${period.key}`}
          fallback={
            <>
              <PanelSkeleton label={loading(t("finance.invoicesTitle"))} />
              <PanelSkeleton label={loading(t("finance.subscriptionsTitle"))} />
            </>
          }
        >
          <FinanceSection {...context} />
        </Suspense>
        <Suspense key={`insights-${period.key}`} fallback={<PanelSkeleton label={loading(t("insights.title"))} />}>
          <InsightsSection {...context} />
        </Suspense>
      </div>

      {/* 5. People */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense
          key={`people-${period.key}`}
          fallback={
            <>
              <PanelSkeleton label={loading(t("people.usersByRole"))} />
              <PanelSkeleton label={loading(t("employers.title"))} />
              <PanelSkeleton label={loading(t("agents.title"))} />
            </>
          }
        >
          <PeopleSection {...context} />
        </Suspense>
      </div>

      {/* 6. Health + 7. Recent activity */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-5">
          <Suspense key={`health-${period.key}`} fallback={<PanelSkeleton label={loading(t("health.title"))} rows={4} className="h-full" />}>
            <HealthSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-7">
          <Suspense fallback={<PanelSkeleton label={loading(t("recent.title"))} rows={8} className="h-full" />}>
            <RecentSection {...context} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
