import { headers } from "next/headers";
import { auth } from "@/lib/auth/config";
import { redirect } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { getNavGroups } from "@/lib/nav/menuConfig";
import { DashboardShell } from "@/components/shared/DashboardShell";
import { SessionWrapper } from "@/components/shared/SessionWrapper";
import { CsrfProvider } from "@/components/shared/CsrfProvider";
import type { UserRole } from "@/models/User";
import { DashboardProviders } from "@/components/shared/DashboardProviders";
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
  const messages = await getMessages();

  // ── Tenant view detection ────────────────────────────────────────────────
  // The middleware injects x-tenant-* headers when an agent/super-agent/admin
  // has an active tenant view session for an employer.
  const reqHeaders = await headers();

  // ── 2FA enforcement for privileged roles ─────────────────────────────────
  // Admin / super-agent accounts may not use the console until they enrol in
  // two-factor auth. Checked against the DB (not the JWT) so enabling 2FA
  // takes effect immediately; the settings page itself is exempt to avoid a
  // redirect loop.
  if (role === "admin" || role === "super_agent") {
    const requestPath = (reqHeaders.get("x-pathname") ?? "").replace(/^\/(?:en|ar)/, "") || "/";
    const settingsPath = role === "admin" ? "/admin/settings" : "/super-agent/settings";
    if (!requestPath.startsWith(settingsPath)) {
      const { connectDB } = await import("@/lib/db/mongoose");
      const { default: UserModel } = await import("@/models/User");
      await connectDB();
      const dbUser = await UserModel.findById(session.user.id).select("twoFactorEnabled").lean<{ twoFactorEnabled?: boolean }>();
      if (dbUser && !dbUser.twoFactorEnabled) {
        redirect(`/${paramLocale}${settingsPath}?setup2fa=1`);
      }
    }
  }

  const tenantEmployerId = reqHeaders.get("x-tenant-employer-id");
  const tenantCompanyName = reqHeaders.get("x-tenant-company-name");
  const tenantActorRole = reqHeaders.get("x-tenant-actor-role") as UserRole | null;

  const isTenantView = !!tenantEmployerId && role !== "employer";

  // When in tenant view use employer nav so the full employer workspace is shown
  const effectiveRole: UserRole = isTenantView ? "employer" : role;
  const navGroups = getNavGroups(effectiveRole, locale);

  // Run maintenance check and shell data fetch in parallel
  const [isMaintenanceMode, { lastLogin, companyLogo }] = await Promise.all([
    role !== "admin" ? getDashboardMaintenanceMode() : Promise.resolve(false),
    getCachedDashboardShellData(session.user.id as string, role),
  ]);

  if (isMaintenanceMode) {
    redirect(`/${paramLocale}/maintenance`);
  }

  const tenantViewData = isTenantView
    ? {
        employerId: tenantEmployerId!,
        companyName: tenantCompanyName ?? "Company",
        actorRole: tenantActorRole ?? role,
        locale,
      }
    : undefined;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <SessionWrapper>
        <CsrfProvider>
          <DashboardProviders>
            <DashboardShell
              navGroups={navGroups}
              locale={locale}
              userName={session.user.name ?? undefined}
              userEmail={session.user.email ?? undefined}
              userRole={effectiveRole}
              lastLogin={lastLogin}
              companyLogo={companyLogo}
              tenantViewData={tenantViewData}
            >
              {children}
            </DashboardShell>
          </DashboardProviders>
        </CsrfProvider>
      </SessionWrapper>
    </NextIntlClientProvider>
  );
}
