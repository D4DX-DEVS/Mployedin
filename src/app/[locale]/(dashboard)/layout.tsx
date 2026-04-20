import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getNavGroups } from "@/lib/nav/menuConfig";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import type { UserRole } from "@/models/User";
import { DashboardProviders } from "@/components/shared/DashboardProviders";
import { RecruitmentAssistantLoader } from "@/components/features/employer/RecruitmentAssistantLoader";
import {
  getCachedDashboardShellData,
  getDashboardMaintenanceMode,
} from "@/lib/dashboard/shellData";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const session = await auth();
  const { locale: paramLocale } = await params;
  if (!session?.user) {
    redirect(`/${paramLocale}/login`);
  }

  const role = (session.user as { role: UserRole }).role;

  // Always use the URL locale so LanguageSwitcher changes take effect immediately
  const locale = paramLocale;
  setRequestLocale(locale);

  const navGroups = getNavGroups(role, locale);

  // Run maintenance check and shell data fetch in parallel
  const [isMaintenanceMode, { lastLogin, companyLogo }] = await Promise.all([
    role !== "admin" ? getDashboardMaintenanceMode() : Promise.resolve(false),
    getCachedDashboardShellData(session.user.id as string, role),
  ]);

  if (isMaintenanceMode) {
    redirect(`/${paramLocale}/maintenance`);
  }

  return (
    <SessionWrapper>
      <CsrfProvider>
        <DashboardProviders>
          <DashboardShell
            navGroups={navGroups}
            locale={locale}
            userName={session.user.name ?? undefined}
            userEmail={session.user.email ?? undefined}
            userRole={role}
            lastLogin={lastLogin}
            companyLogo={companyLogo}
          >
            {children}
          </DashboardShell>
          {/* Recruitment AI assistant — employer-only floating panel */}
          {role === "employer" && <RecruitmentAssistantLoader />}
        </DashboardProviders>
      </CsrfProvider>
    </SessionWrapper>
  );
}
