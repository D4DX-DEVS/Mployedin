"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { CommandMenuTrigger } from "@/components/shared/CommandMenu";
import { CreateMenu } from "@/components/shared/CreateMenu";
import { MessagesIndicator, navHasMessagesEntry } from "@/components/shared/MessagesIndicator";
import { useUnreadMessageCount } from "@/hooks/useConversations";
import dynamic from "next/dynamic";

const Copilot = dynamic(
  () =>
    import("@/components/shared/Copilot").then((m) => m.Copilot),
  { ssr: false }
);
const CommandMenu = dynamic(
  () =>
    import("@/components/shared/CommandMenu").then((m) => m.CommandMenu),
  { ssr: false }
);
const NotificationBell = dynamic(
  () =>
    import("@/components/shared/NotificationBell").then((m) => m.NotificationBell),
  { ssr: false }
);
import PublicFooter from "@/components/shared/PublicFooter";
import { UserProfileDropdown } from "@/components/shared/UserProfileDropdown";
import { WorkspaceBottomNav } from "@/components/shared/WorkspaceBottomNav";
import { TenantViewBanner } from "@/components/features/tenant/TenantViewBanner";
import type { NavGroup } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";
import { WORKSPACE_BOTTOM_NAV_TABS } from "@/lib/nav/bottomNavTabs";
import type { NavBadgeKey } from "@/lib/nav/menuConfig";
import { useAdminActionCounts } from "@/hooks/useAdminActionCounts";
import { useJobSeekerActionCounts } from "@/hooks/useJobSeekerActionCounts";
import { useAgentActionCounts } from "@/hooks/useAgentActionCounts";
import { useSuperAgentActionCounts } from "@/hooks/useSuperAgentActionCounts";
import type { UserRole } from "@/types/user";

interface TenantViewData {
  employerId: string;
  companyName: string;
  actorRole: UserRole;
  locale: string;
}

interface DashboardShellProps {
  children: React.ReactNode;
  navGroups: NavGroup[];
  locale: string;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  lastLogin?: string;
  companyLogo?: string;
  /** Present when an agent/super-agent/admin is viewing an employer's workspace */
  tenantViewData?: TenantViewData;
}

export function DashboardShell({
  children,
  navGroups,
  locale,
  userName,
  userEmail,
  userRole,
  lastLogin,
  companyLogo,
  tenantViewData,
}: DashboardShellProps) {
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const unreadMessageCount = useUnreadMessageCount();
  const isJobSeeker = userRole === "job_seeker";
  const isAdmin = userRole === "admin";
  const isSuperAgent = userRole === "super_agent";
  const seekerCounts = useJobSeekerActionCounts(isJobSeeker);
  const adminCounts = useAdminActionCounts(isAdmin);
  const superAgentCounts = useSuperAgentActionCounts(isSuperAgent);
  const agentCounts = useAgentActionCounts(userRole === "agent");
  // Every live counter in one place, keyed the way nav entries and bottom tabs
  // declare them. Roles that own none of these read zeroes; their hooks are
  // disabled, so no request is made.
  const navCounts: Record<NavBadgeKey, number> = {
    unreadMessages: unreadMessageCount,
    pendingOffers: seekerCounts.pendingOffers,
    interviewsAwaitingResponse: seekerCounts.interviewsAwaitingResponse,
    openSupportTickets: adminCounts.openSupportTickets,
    unreadContactSubmissions: adminCounts.unreadContactSubmissions,
    pendingExhibitionReviews: superAgentCounts.pendingExhibitionReviews,
    pendingCommissionApprovals: superAgentCounts.pendingCommissionApprovals,
    overdueTasks: agentCounts.overdueTasks,
    dueFollowUps: agentCounts.dueFollowUps,
  };
  // Agent/super-agent list pages share the exact same admin-authored
  // components (PageHero, data-table-toolbar, <Table>), so they get the same
  // untuned-on-mobile problem the CSS below already fixes for admin.
  const isAdminWorkspace = userRole === "admin" || userRole === "agent" || userRole === "super_agent";
  const usesModernWorkspaceShell = userRole === "admin" || userRole === "employer" || userRole === "agent" || userRole === "super_agent";
  const bottomNavTabConfigs = WORKSPACE_BOTTOM_NAV_TABS[userRole as UserRole] ?? [];
  const bottomNavTabs = bottomNavTabConfigs.map((tab) => ({
    key: tab.key,
    href: tab.href,
    icon: getIcon(tab.icon),
    label: tNav(tab.labelKey),
    exact: tab.exact,
    badgeCount: tab.badgeKey ? navCounts[tab.badgeKey] : undefined,
  }));
  // "More" carries only what it actually hides. A count whose destination is a
  // visible tab is painted on that tab instead — every count used to land on
  // the drawer, so employer and agent showed the unread badge on "More" while
  // the Messages tab beside it stayed blank.
  const tabBadgeKeys = new Set(
    bottomNavTabConfigs.map((tab) => tab.badgeKey).filter(Boolean) as NavBadgeKey[]
  );
  const dashboardRoot = (WORKSPACE_BOTTOM_NAV_TABS[userRole as UserRole] ?? []).find((t) => t.exact)?.href;
  // The topbar inbox icon is the same kind of visible destination as a tab: if
  // it is showing, the unread count is already on screen and "More" would be
  // badging a drawer that has no inbox in it.
  const topbarOwnsMessages = Boolean(
    dashboardRoot && !navHasMessagesEntry(navGroups, `/${locale}${dashboardRoot}`)
  );
  const menuBadgeCount = (Object.keys(navCounts) as NavBadgeKey[])
    .filter((key) => !tabBadgeKeys.has(key))
    .filter((key) => !(topbarOwnsMessages && key === "unreadMessages"))
    .reduce((sum, key) => sum + navCounts[key], 0);
  // ponytail: phones get the sidebar via the bottom bar's "More" tab, so the
  // topbar hamburger is dropped there.
  //
  // The topbar itself used to be hidden on phones on every page except the
  // workspace root. It is the only home of the ⌘K trigger, the notification
  // bell and the profile menu — and Settings is reachable ONLY from that
  // profile menu — so on a phone, on any non-root page, search, notifications
  // and Settings were all unreachable without navigating home first. The
  // header stays.
  const hasBottomNav = bottomNavTabs.length > 0;

  // Defer Radix-based components to avoid SSR/client ID mismatch hydration errors
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className={`dashboard-shell bg-background ${usesModernWorkspaceShell ? "dashboard-shell-workspace" : ""} ${isAdminWorkspace ? "dashboard-shell-admin" : ""} flex h-screen overflow-hidden`}>
      {/* Sidebar (desktop + mobile overlay handled inside) */}
      <Sidebar
        navGroups={navGroups}
        locale={locale}
        userRole={userRole}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        companyLogo={companyLogo}
      />

      {/* Main content area */}
      <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
        {/* Tenant view banner — shown at the top of the content area */}
        {tenantViewData && (
          <TenantViewBanner
            companyName={tenantViewData.companyName}
            actorRole={tenantViewData.actorRole}
            locale={tenantViewData.locale}
          />
        )}
        {/* Topbar */}
        <header className={`dashboard-topbar border-b border-border/40 bg-background z-30 sticky top-0 transition-all ${usesModernWorkspaceShell ? "dashboard-topbar-workspace h-14 sm:h-16" : "h-14 sm:h-16"}`}>
          <div className="flex h-full items-center gap-1.5 px-3 sm:gap-2 sm:px-4 md:gap-3 lg:px-6">
            {!hasBottomNav && <MobileMenuButton onClick={() => setMobileOpen(true)} />}

            {/* ponytail: the hamburger used to hold this slot on phones; the logo
                fills it now so the topbar is not three controls floating right. */}
            {hasBottomNav && (
              <Link
                href={`/${locale}${dashboardRoot ?? ""}`}
                className="shrink-0 lg:hidden"
                aria-label={tNav("a11yHome")}
              >
                <Image
                  src="/logo.png"
                  alt="Mployedin"
                  width={100}
                  height={34}
                  className="h-auto w-[96px] object-contain"
                  style={{ height: "auto" }}
                  priority
                />
              </Link>
            )}

            <div className="flex-1 min-w-0">
              <div className="hidden md:block">
                <CommandMenuTrigger locale={locale} />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-3">
              <div className="md:hidden">
                <CommandMenuTrigger locale={locale} compact />
              </div>
              {mounted && (
                <>
                  {/* Theme + locale moved into the profile menu (all breakpoints) —
                      four topbar controls left no room for the search trigger. */}
                  {/* No Create here: the topbar menu doubled the primary action
                      each page already renders in its own header. Creating on a
                      wide screen goes through the page action or ⌘K; phones keep
                      the raised Create in the tab bar below. */}
                  {dashboardRoot && (
                    <MessagesIndicator navGroups={navGroups} rootHref={`/${locale}${dashboardRoot}`} />
                  )}
                  <NotificationBell locale={locale} />
                  <UserProfileDropdown
                    userName={userName ?? "User"}
                    userEmail={userEmail ?? ""}
                    userRole={userRole ?? "job_seeker"}
                    lastLogin={lastLogin}
                    locale={locale}
                    companyLogo={companyLogo}
                  />
                </>
              )}
            </div>
          </div>
        </header>
        {/* Page content */}
          <main className={`dashboard-main isolate min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background ${usesModernWorkspaceShell ? "dashboard-main-workspace" : ""} ${bottomNavTabs.length > 0 ? "pb-16 lg:pb-0" : ""}`}>
            {children}
          </main>
          {/* Workspace phones get a tab bar for each role's daily destinations;
              everything else stays one tap away behind the "More" tab. */}
          {bottomNavTabs.length > 0 && (
            <WorkspaceBottomNav
              locale={locale}
              tabs={bottomNavTabs}
              onOpenMenu={() => setMobileOpen(true)}
              menuLabel={tNav("more")}
              ariaLabel={tNav("a11yNavigationMenu")}
              createSlot={
                mounted ? <CreateMenu locale={locale} userRole={userRole} variant="bottomBar" /> : null
              }
              menuBadgeCount={menuBadgeCount}
            />
          )}
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} userRole={userRole} />

      {/* Floating AI Copilot — role-scoped read + action tools for every dashboard role */}
      <Copilot />
    </div>
  );
}
