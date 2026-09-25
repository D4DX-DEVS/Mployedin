import { Suspense } from "react";
import { auth } from "@/lib/auth/config";
import { Activity } from "lucide-react";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { DASHBOARD_PERIODS, resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { canAccess } from "@/lib/permissions/matrix";
import type { CustomPermissions, PermissionMode, Resource, UserRole } from "@/types/user";
import { DashboardToolbar } from "./_components/dashboard-toolbar";
import { SectionSkeleton } from "./_components/section-states";
import {
  FinanceSection,
  HealthSection,
  PeopleSection,
  QueueSection,
  RecentSection,
  RecruitmentSection,
  SnapshotSection,
  type SectionContext,
} from "./_components/sections";

/*
 * Admin dashboard, ordered by what an admin opens it for:
 *   1. what needs a decision or is going wrong (the action queue);
 *   2. the platform in five numbers;
 *   3. recruitment, then the people and network behind it;
 *   4. money;
 *   5. whether the systems underneath are healthy;
 *   6. what just happened.
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
  searchParams: Promise<{ period?: string | string[] }>;
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
  const hour = now.getHours();
  const adminName = user.name ?? t("hero.fallbackName");
  const greeting =
    hour < 12
      ? t("hero.greetingMorning", { name: adminName })
      : hour < 17
        ? t("hero.greetingAfternoon", { name: adminName })
        : t("hero.greetingEvening", { name: adminName });
  const updatedLabel = t("hero.updated", {
    time: now.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  });
  const loading = (section: string) => t("sectionLoading", { section });

  return (
    <div className="page-container dashboard-overview-page">
      <DashboardPageHeader
        icon={Activity}
        title={greeting}
        description={t("hero.description")}
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
      />

      <Suspense fallback={<SectionSkeleton label={loading(t("queue.title"))} cards={3} rows={1} className="md:grid-cols-2 xl:grid-cols-3" />}>
        <QueueSection {...context} />
      </Suspense>

      <Suspense key={`snapshot-${period.key}`} fallback={<SectionSkeleton label={loading(t("snapshot.title"))} cards={5} rows={2} className="max-lg:grid-cols-2 lg:grid-cols-5" />}>
        <SnapshotSection {...context} />
      </Suspense>

      <Suspense key={`recruitment-${period.key}`} fallback={<SectionSkeleton label={loading(t("recruitment.title"))} cards={3} rows={6} />}>
        <RecruitmentSection {...context} />
      </Suspense>

      <Suspense key={`people-${period.key}`} fallback={<SectionSkeleton label={loading(t("people.title"))} cards={3} rows={5} />}>
        <PeopleSection {...context} />
      </Suspense>

      <Suspense key={`finance-${period.key}`} fallback={<SectionSkeleton label={loading(t("finance.title"))} cards={3} rows={5} />}>
        <FinanceSection {...context} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton label={loading(t("health.title"))} cards={4} rows={1} className="sm:grid-cols-2 xl:grid-cols-4" />}>
        <HealthSection {...context} />
      </Suspense>

      <Suspense fallback={<SectionSkeleton label={loading(t("recent.title"))} cards={1} rows={8} className="" />}>
        <RecentSection {...context} />
      </Suspense>
    </div>
  );
}
