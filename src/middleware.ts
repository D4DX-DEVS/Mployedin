import { auth } from "@/lib/auth/config";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getDashboardPath } from "@/lib/permissions/matrix";
import type { UserRole } from "@/models/User";

const locales = ["en", "ar"] as const;
const defaultLocale = "en";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

/** Public routes that don't require auth */
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/api/auth",
];

/** Role → allowed dashboard path prefixes */
const ROLE_ROUTES: Record<string, string[]> = {
  admin: ["/admin", "/super-agent", "/agent", "/employer", "/job-seeker"],
  super_agent: ["/super-agent"],
  agent: ["/agent"],
  employer: ["/employer"],
  job_seeker: ["/job-seeker"],
};

/** Check if path is a public route (locale-stripped) */
function isPublicRoute(pathname: string): boolean {
  const stripped = pathname.replace(/^\/(?:en|ar)/, "") || "/";
  return PUBLIC_ROUTES.some((r) => stripped.startsWith(r));
}

/** Check if user role is allowed to access the dashboard section */
function isRoleAllowed(role: UserRole, pathname: string): boolean {
  const stripped = pathname.replace(/^\/(?:en|ar)/, "") || "/";
  // Root "/" or non-dashboard routes — allow
  const dashboardSections = ["/admin", "/super-agent", "/agent", "/employer", "/job-seeker"];
  const inDashboard = dashboardSections.some((s) => stripped.startsWith(s));
  if (!inDashboard) return true;
  // Check if role has access to this section
  const allowed = ROLE_ROUTES[role] ?? [];
  return allowed.some((prefix) => stripped.startsWith(prefix));
}

export default auth(async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip intl for API routes
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Apply i18n middleware first
  const intlResponse = intlMiddleware(req);

  // Check auth session
  const session = (req as unknown as { auth?: { user?: { id: string; role: UserRole; locale: string } } }).auth;

  const isPublic = isPublicRoute(pathname);

  if (!session?.user && !isPublic) {
    const locale = pathname.split("/")[1] ?? defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return NextResponse.redirect(loginUrl);
  }

  if (session?.user && isPublic) {
    const role = session.user.role;
    const locale = session.user.locale ?? defaultLocale;
    return NextResponse.redirect(
      new URL(getDashboardPath(role, locale), req.url)
    );
  }

  // Enforce role-based dashboard route access
  if (session?.user && !isRoleAllowed(session.user.role, pathname)) {
    const role = session.user.role;
    const locale = session.user.locale ?? defaultLocale;
    return NextResponse.redirect(
      new URL(getDashboardPath(role, locale), req.url)
    );
  }

  return intlResponse ?? NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
