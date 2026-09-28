import { Suspense } from "react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DASHBOARD_PERIODS, resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { canAccess } from "@/lib/permissions/matrix";
import type { CustomPermissions, PermissionMode, Resource, UserRole } from "@/types/user";
import { DashboardToolbar } from "./_components/dashboard-toolbar";
import {
  FinanceSkeleton,
  FunnelSkeleton,
  PeopleSkeleton,
  QueueSkeleton,
  RecruitmentSkeleton,
  SnapshotSkeleton,
} from "./_components/section-states";
import {
  FinanceSection,
  HiringFunnelSection,
  PeopleSection,
  QueueSection,
  RecruitmentSection,
  SnapshotSection,
  type SectionContext,
} from "./_components/sections";
import { AdminDashboardTabs, type DashboardTab } from "./_components/admin-dashboard-tabs";

/*
 * Admin dashboard, one question per tab:
 *   1. Overview — the platform in five numbers and the hiring funnel;
 *   2. Needs your attention — what needs a decision or is going wrong;
 *   3. Quick analysis — recruitment, people and finance behind the snapshot.
 *
 * Each metric has one home. Counts of things to act on live only in the
 * queue; the sections hold the context around them. Every figure is counted
 * from stored data — metrics the platform does not record (job or employer
 * approvals, background-job runs, storage) are absent rather than faked.
 *
 * The header renders at once; each section streams in on its own, so one slow
 * query never holds up the rest.
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

  const { period: periodParam, tab: tabParam } = await searchParams;
  const period = resolveDashboardPeriod(Array.isArray(periodParam) ? periodParam[0] : periodParam);
  const requestedTab = Array.isArray(tabParam) ? tabParam[0] : tabParam;
  const activeTab: DashboardTab = requestedTab === "attention" || requestedTab === "analysis" ? requestedTab : "overview";
  const tabHref = (tab: DashboardTab) => `/${locale}/admin?tab=${tab}&period=${period.key}`;

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

  return (
    <div className="page-container dashboard-overview-page">
      <AdminDashboardTabs
        activeTab={activeTab}
        ariaLabel={t("tabs.ariaLabel")}
        labels={{
          overview: t("tabs.overview"),
          attention: t("tabs.attention"),
          analysis: t("tabs.analysis"),
        }}
        hrefFor={tabHref}
        actions={
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
        }
      >
        {activeTab === "overview" && (
          <div className="space-y-4">
            <Suspense key={`snapshot-${period.key}`} fallback={<SnapshotSkeleton label={loading(t("snapshot.title"))} />}>
              <SnapshotSection {...context} />
            </Suspense>
            <Suspense key={`funnel-${period.key}`} fallback={<FunnelSkeleton label={loading(t("funnel.title"))} />}>
              <HiringFunnelSection {...context} />
            </Suspense>
          </div>
        )}
        {activeTab === "attention" && (
          <Suspense fallback={<QueueSkeleton label={loading(t("queue.title"))} />}>
            <QueueSection {...context} />
          </Suspense>
        )}
        {activeTab === "analysis" && (
          <div className="space-y-4">
            <Suspense key={`recruitment-${period.key}`} fallback={<RecruitmentSkeleton label={loading(t("recruitment.title"))} />}>
              <RecruitmentSection {...context} />
            </Suspense>
            <Suspense key={`people-${period.key}`} fallback={<PeopleSkeleton label={loading(t("people.title"))} />}>
              <PeopleSection {...context} />
            </Suspense>
            <Suspense key={`finance-${period.key}`} fallback={<FinanceSkeleton label={loading(t("finance.title"))} />}>
              <FinanceSection {...context} />
            </Suspense>
          </div>
        )}
      </AdminDashboardTabs>
    </div>
  );
}
