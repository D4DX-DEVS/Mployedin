"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
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
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { UserProfileDropdown } from "@/components/shared/UserProfileDropdown";
import { JobSeekerTopNav, JobSeekerBottomNav } from "@/components/shared/JobSeekerTopNav";
import { EmployerBottomNav } from "@/components/shared/EmployerBottomNav";
import { TenantViewBanner } from "@/components/features/tenant/TenantViewBanner";
import type { NavGroup } from "@/lib/nav/menuConfig";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const isJobSeeker = userRole === "job_seeker";
  const isEmployer = userRole === "employer";
  const isAdminWorkspace = userRole === "admin";
  const usesModernWorkspaceShell = userRole === "admin" || userRole === "employer" || userRole === "agent" || userRole === "super_agent";
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
        <header className={`dashboard-topbar border-b border-border/40 bg-background z-30 sticky top-0 transition-all ${usesModernWorkspaceShell ? "dashboard-topbar-workspace h-14 sm:h-16" : isJobSeeker ? "h-14 sm:h-16" : "h-14"}`}>
          <div className="flex h-full items-center gap-1.5 px-3 sm:gap-2 sm:px-4 md:gap-3 lg:px-6">
            {!isJobSeeker && <MobileMenuButton onClick={() => setMobileOpen(true)} />}

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
                  <ThemeToggle className={isJobSeeker ? "hidden min-[360px]:inline-flex" : undefined} />
                  <LanguageSwitcher />
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
          <main className={`dashboard-main isolate min-h-0 flex-1 overflow-y-auto overscroll-contain bg-background ${usesModernWorkspaceShell ? "dashboard-main-workspace" : ""} ${isEmployer ? "pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0" : ""}`}>
            {children}
          </main>
        )}
        {isEmployer && <EmployerBottomNav locale={locale} onMore={() => setMobileOpen(true)} />}
      </div>

      {/* Cmd+K menu */}
      <CommandMenu navGroups={navGroups} locale={locale} />

      {/* Floating AI Copilot — role-scoped read + action tools for every dashboard role */}
      {!mobileOpen && (
        <Copilot
          triggerClassName={
            isJobSeeker || isEmployer
              ? "bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4"
              : undefined
          }
        />
      )}
    </div>
  );
}
