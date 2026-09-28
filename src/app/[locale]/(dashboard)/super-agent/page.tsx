import { Suspense } from "react";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CalendarDays, DollarSign, MapPinned, UserPlus } from "lucide-react";
import { QuickActions, type QuickAction } from "@/components/shared/DashboardKit";
import { canAccess } from "@/lib/permissions/matrix";
import type { Action, CustomPermissions, PermissionMode, Resource, UserRole } from "@/types/user";
import { HeaderSkeleton, KpiStripSkeleton, PanelSkeleton } from "./_components/section-states";
import {
  ActivitySection,
  CommissionSection,
  ExhibitionsSection,
  FunnelSection,
  HeaderSection,
  KpiSection,
  QueueSection,
  TeamSplitSection,
  TopAgentsSection,
  type SectionContext,
} from "./_components/sections";

/*
 * The super-agent home: one scrollable overview, ordered by what they open it for.
 *
 *   1. greeting with their assigned region, and the four things they come to do;
 *   2. six headline numbers with 30-day sparklines and last-month deltas;
 *   3. what is waiting on them, beside six months of team activity;
 *   4. the regional funnel, the roster by state, and commissions by stage;
 *   5. the most productive agents, and exhibitions & targets.
 *
 * Every figure is counted live from stored data, scoped to team ∪ region, and
 * every number links to the list it counts. Each section streams in on its own
 * so one slow query never holds up the rest.
 */
export default async function SuperAgentDashboard({ params }: { params: Promise<{ locale: string }> }) {
  const session = await auth();
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("superAgentDashboard");
  if (!session?.user) redirect(`/${locale}/login`);

  const user = session.user as unknown as {
    id: string;
    name?: string | null;
    role?: UserRole;
    permissionMode?: PermissionMode;
    customPermissions?: CustomPermissions;
  };
  // The super-agent layout already admits only this role; the matrix here
  // lets a custom permission set hide an action the API would refuse anyway.
  const can = (resource: Resource, action: Action) =>
    canAccess(user.role ?? "super_agent", resource, action, { permissionMode: user.permissionMode, customPermissions: user.customPermissions });

  const now = new Date();
  const context: SectionContext = { userId: user.id, userName: user.name, locale, now };
  const href = (path: string) => `/${locale}/super-agent${path}`;
  const loading = (section: string) => t("sectionLoading", { section });

  const quickActions: QuickAction[] = [
    can("agents", "create") && { key: "addAgent", label: t("quickActions.addAgent"), href: href("/agents?new=1"), icon: UserPlus, primary: true },
    { key: "assignTerritory", label: t("quickActions.assignTerritory"), href: href("/territory"), icon: MapPinned },
    can("commissions", "approve") && { key: "reviewCommissions", label: t("quickActions.reviewCommissions"), href: href("/commissions?status=pending"), icon: DollarSign },
    can("exhibitions", "approve") && { key: "exhibitions", label: t("quickActions.exhibitions"), href: href("/exhibitions?status=pending_review"), icon: CalendarDays },
  ].filter(Boolean) as QuickAction[];

  return (
    <div className="page-container dashboard-overview-page space-y-4">
      <header className="flex flex-col gap-3">
        <Suspense fallback={<HeaderSkeleton label={loading(t("hero.title"))} />}>
          <HeaderSection {...context} />
        </Suspense>
        {quickActions.length > 0 && <QuickActions actions={quickActions} ariaLabel={t("quickActions.label")} />}
      </header>

      {/* 2. Headline numbers */}
      <Suspense fallback={<KpiStripSkeleton label={loading(t("kpi.title"))} />}>
        <KpiSection {...context} />
      </Suspense>

      {/* 3. What needs the super-agent + team activity */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-4">
          <Suspense fallback={<PanelSkeleton label={loading(t("priority.title"))} rows={6} className="h-full" />}>
            <QueueSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-8">
          <Suspense fallback={<PanelSkeleton label={loading(t("activity.title"))} rows={7} className="h-full" />}>
            <ActivitySection {...context} />
          </Suspense>
        </div>
      </div>

      {/* 4. Funnel, roster, money */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Suspense fallback={<PanelSkeleton label={loading(t("funnelPanel.title"))} rows={6} />}>
          <FunnelSection {...context} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton label={loading(t("team.title"))} rows={4} />}>
          <TeamSplitSection {...context} />
        </Suspense>
        <Suspense fallback={<PanelSkeleton label={loading(t("commission.title"))} rows={4} />}>
          <CommissionSection {...context} />
        </Suspense>
      </div>

      {/* 5. Top agents + exhibitions & targets */}
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <Suspense fallback={<PanelSkeleton label={loading(t("topAgents.title"))} rows={6} className="h-full" />}>
            <TopAgentsSection {...context} />
          </Suspense>
        </div>
        <div className="xl:col-span-5">
          <Suspense fallback={<PanelSkeleton label={loading(t("exhibitions.title"))} rows={5} className="h-full" />}>
            <ExhibitionsSection {...context} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
