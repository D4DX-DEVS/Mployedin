"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sidebar, MobileMenuButton } from "@/components/shared/Sidebar";
import { CommandMenuTrigger } from "@/components/shared/CommandMenu";
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
import { JobSeekerTopNav, JobSeekerBottomNav } from "@/components/shared/JobSeekerTopNav";
import { WorkspaceBottomNav } from "@/components/shared/WorkspaceBottomNav";
import { TenantViewBanner } from "@/components/features/tenant/TenantViewBanner";
import type { NavGroup } from "@/lib/nav/menuConfig";
import { getIcon } from "@/lib/nav/iconRegistry";
import { WORKSPACE_BOTTOM_NAV_TABS } from "@/lib/nav/bottomNavTabs";
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
  const isJobSeeker = userRole === "job_seeker";
  // Agent/super-agent list pages share the exact same admin-authored
  // components (PageHero, data-table-toolbar, <Table>), so they get the same
  // untuned-on-mobile problem the CSS below already fixes for admin.
  const isAdminWorkspace = userRole === "admin" || userRole === "agent" || userRole === "super_agent";
  const usesModernWorkspaceShell = userRole === "admin" || userRole === "employer" || userRole === "agent" || userRole === "super_agent";
  const bottomNavTabs = (WORKSPACE_BOTTOM_NAV_TABS[userRole as UserRole] ?? []).map((tab) => ({
    key: tab.key,
    href: tab.href,
    icon: getIcon(tab.icon),
    label: tNav(tab.labelKey),
    exact: tab.exact,
  }));
  // ponytail: phones already get the sidebar via the bottom bar's "More" tab, so
  // the topbar hamburger is dropped and the whole topbar is hidden everywhere
  // except each workspace's dashboard root (the tab flagged `exact`).
  const hasBottomNav = bottomNavTabs.length > 0;
  const dashboardRoot = (WORKSPACE_BOTTOM_NAV_TABS[userRole as UserRole] ?? []).find((t) => t.exact)?.href;
  const isDashboardRoot = !dashboardRoot || pathname === `/${locale}${dashboardRoot}`;
  const hideTopbarOnMobile = hasBottomNav && !isDashboardRoot;

  // Defer Radix-based components to avoid SSR/client ID mismatch hydration errors
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className={`dashboard-shell bg-background ${usesModernWorkspaceShell ? "dashboard-shell-workspace" : ""} ${isAdminWorkspace ? "dashboard-shell-admin" : ""} ${isJobSeeker ? "flex min-h-screen flex-col" : "flex h-screen overflow-hidden"}`}>
      {/* Sidebar (desktop + mobile overlay handled inside) */}
      {!isJobSeeker && (
        <Sidebar
          navGroups={navGroups}
          locale={locale}
          userRole={userRole}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
          companyLogo={companyLogo}
        />
      )}

      {/* Main content area */}
      <div className={`flex flex-1 flex-col min-w-0 ${isJobSeeker ? "" : "min-h-0 overflow-hidden"}`}>
        {/* Tenant view banner — shown at the top of the content area */}
        {tenantViewData && (
          <TenantViewBanner
            companyName={tenantViewData.companyName}
            actorRole={tenantViewData.actorRole}
            locale={tenantViewData.locale}
          />
        )}
        {/* Topbar */}
        <header className={`dashboard-topbar border-b border-border/40 bg-background z-30 sticky top-0 transition-all ${hideTopbarOnMobile ? "hidden lg:block " : ""}${usesModernWorkspaceShell ? "dashboard-topbar-workspace h-14 sm:h-16" : isJobSeeker ? "h-14 sm:h-16" : "h-14"}`}>
          <div className="flex h-full items-center gap-1.5 px-3 sm:gap-2 sm:px-4 md:gap-3 lg:px-6">
            {!isJobSeeker && !hasBottomNav && <MobileMenuButton onClick={() => setMobileOpen(true)} />}

            {/* ponytail: the hamburger used to hold this slot on phones; the logo
                fills it now so the topbar is not three controls floating right. */}
            {!isJobSeeker && hasBottomNav && (
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

            {isJobSeeker && (
              <Link href={`/${locale}/job-seeker`} className="shrink-0" aria-label={tNav("a11yHome")}>
                <Image
                  src="/logo.png"
                  alt="Mployedin"
                  width={100}
                  height={34}
                  className="h-auto w-[80px] object-contain min-[360px]:w-[88px] sm:w-[141px]"
                  style={{ height: "auto" }}
                  priority
                />
              </Link>
            )}

            {isJobSeeker && <JobSeekerTopNav locale={locale} />}

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
        {isJobSeeker ? (
          <>
            <main className="dashboard-main isolate flex-1 bg-background pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0">
              {children}
            </main>
            <JobSeekerBottomNav locale={locale} />
          </>
        ) : (
          <>
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
              />
            )}
          </>
        )}
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} />

      {/* Floating AI Copilot — role-scoped read + action tools for every dashboard role */}
      <Copilot />
    </div>
  );
}
