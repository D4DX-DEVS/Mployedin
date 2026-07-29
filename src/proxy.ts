import { auth } from "@/lib/auth/edge-config";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
// mcp-handler (used by /api/mcp) ambiently augments the global `Request.auth`
// type to `AuthInfo | undefined` for its own bearer-token auth. That
// collides with plain `NextRequest` here, since next-auth's own `auth()` HOC
// expects `NextAuthRequest` (auth: Session | null) specifically — typing the
// callback param as NextAuthRequest (a strict superset of NextRequest)
// resolves the correct overload without affecting runtime behavior.
import type { NextAuthRequest } from "next-auth";
import { getDashboardPath } from "@/lib/permissions/matrix";
import type { UserRole } from "@/types/user";
import { SECURITY_HEADERS, getSecurityHeaders } from "@/lib/security/headers";
import { setCsrfCookie, validateCsrf, isCsrfExempt } from "@/lib/security/csrf";
import { TENANT_COOKIE_NAME, verifyTenantCookie } from "@/lib/security/tenantCookie";
import { isPublicRoute } from "@/lib/routing/publicRoutes";
import { withTrustedClientIp } from "@/lib/security/clientIp";

const locales = ["en", "ar"] as const;
const defaultLocale = "en";

const intlMiddleware = createIntlMiddleware({
  locales,
  defaultLocale,
  localePrefix: "always",
});

/** Auth-specific routes — logged-in users are redirected away from these */
const AUTH_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/onboarding",
];

/** Role → allowed dashboard path prefixes */
const ROLE_ROUTES: Record<string, string[]> = {
  admin: ["/admin", "/super-agent", "/agent", "/employer", "/job-seeker"],
  super_agent: ["/super-agent"],
  agent: ["/agent"],
  employer: ["/employer"],
  job_seeker: ["/job-seeker"],
};

/** Check if user role is allowed to access the dashboard section */
function isRoleAllowed(role: UserRole, pathname: string): boolean {
  const stripped = pathname.replace(/^\/(?:en|ar)/, "") || "/";
  // Root "/" or non-dashboard routes — allow
  const dashboardSections = ["/admin", "/super-agent", "/agent", "/employer", "/job-seeker"];
  const inDashboard = dashboardSections.some((s) => stripped === s || stripped.startsWith(s + "/"));
  if (!inDashboard) return true;
  // Check if role has access to this section
  const allowed = ROLE_ROUTES[role] ?? [];
  return allowed.some((prefix) => stripped === prefix || stripped.startsWith(prefix + "/"));
}

/** Apply static security headers to API/redirect responses (no nonce). */
function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/** Apply nonce-aware security headers to page responses. */
function withPageSecurityHeaders(response: NextResponse, nonce: string): NextResponse {
  for (const [key, value] of Object.entries(getSecurityHeaders(nonce))) {
    response.headers.set(key, value);
  }
  return response;
}

export default auth(async function middleware(req: NextAuthRequest) {
  const { pathname } = req.nextUrl;
  // Plain-NextRequest view for helpers that don't care about `.auth` — see the
  // NextAuthRequest import comment above for why the two types don't unify.
  const plainReq = req as unknown as NextRequest;

  // Skip static assets that should never be processed by middleware.
  // Belt-and-suspenders: the matcher regex should exclude these, but some
  // Edge Runtimes evaluate the pattern differently, causing sw.js to be
  // redirected by the intl middleware (breaks Service Worker registration).
  if (/^\/(sw\.js|workbox-.*\.js)(\.map)?$/.test(pathname)) {
    return NextResponse.next();
  }

  // The PWA offline fallback is a static file at /offline.html, plus the
  // Next.js route the Service Worker precaches at /~offline. Both must be
  // served directly — applying auth (redirect to login) or i18n (locale
  // prefixing) would break the Service Worker's precache of the fallback.
  if (pathname === "/offline.html" || pathname === "/~offline") {
    return NextResponse.next();
  }

  // OAuth discovery metadata (RFC 8414 / RFC 9728) for the MCP connector must be
  // served as plain JSON to unauthenticated clients (ChatGPT's discovery step
  // happens before any user is logged in). /.well-known/* doesn't start with
  // /api/, so without this it would fall into the page pipeline below and get
  // redirected to /en/login instead of returning JSON. Rewritten (not redirected)
  // to a route handler under /api/mcp/well-known — App Router route segments
  // starting with "." are unconventional/risky, so the dot-prefixed public path
  // is served via a rewrite rather than a literal folder name.
  if (pathname === "/.well-known/oauth-authorization-server" || pathname === "/.well-known/oauth-protected-resource") {
    const url = req.nextUrl.clone();
    url.pathname = `/api/mcp/well-known${pathname.slice("/.well-known".length)}`;
    return withSecurityHeaders(NextResponse.rewrite(url));
  }

  // Redirect locale-prefixed API routes → /api/… (clients like next-auth/react
  // may resolve relative URLs against the current locale-prefixed page).
  // 307 preserves the HTTP method (important for POST signIn calls).
  const localeApiMatch = pathname.match(/^\/(en|ar)(\/api\/.*)$/);
  if (localeApiMatch) {
    const url = req.nextUrl.clone();
    url.pathname = localeApiMatch[2]; // e.g. /api/auth/session
    return withSecurityHeaders(NextResponse.redirect(url, 307));
  }

  // Redirect locale-prefixed public static files (e.g. /en/manifest.json)
  const localeStaticMatch = pathname.match(/^\/(en|ar)\/(manifest\.json|robots\.txt|llms\.txt|sitemap\.xml)$/);
  if (localeStaticMatch) {
    const url = req.nextUrl.clone();
    url.pathname = `/${localeStaticMatch[2]}`;
    return withSecurityHeaders(NextResponse.redirect(url, 308));
  }

  // API routes — apply security headers + CSRF, skip i18n (no nonce needed)
  if (pathname.startsWith("/api/")) {
    const isStateMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
    if (isStateMutating && !isCsrfExempt(pathname)) {
      const csrfError = validateCsrf(plainReq);
      if (csrfError) return withSecurityHeaders(csrfError);
    }
    // Defense-in-depth: role-owned API namespaces (mirrors ROLE_ROUTES for
    // pages). Only namespaces with a single owning role are gated here —
    // /api/admin/* is NOT, because employer pages legitimately read
    // admin-published templates. Anonymous requests fall through to each
    // route's withAuth() 401.
    const apiRole = (req as unknown as { auth?: { user?: { role: UserRole } } }).auth?.user?.role;
    if (apiRole) {
      const forbidden =
        (pathname.startsWith("/api/super-agent/") && apiRole !== "super_agent" && apiRole !== "admin") ||
        (pathname.startsWith("/api/agent/") && apiRole !== "agent" && apiRole !== "admin");
      if (forbidden) {
        return withSecurityHeaders(
          NextResponse.json({ error: "Forbidden" }, { status: 403 })
        );
      }
    }
    return withSecurityHeaders(
      NextResponse.next({ request: { headers: trustedRequestHeaders } }),
    );
  }

  // Generate a per-request nonce for page CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Derive active locale from the URL path (e.g. /ar/employer → "ar")
  const pathLocale = pathname.split("/")[1];
  const activeLocale = locales.includes(pathLocale as (typeof locales)[number])
    ? pathLocale
    : defaultLocale;

  // Build request headers that will be forwarded to the app (includes x-nonce).
  // Next.js App Router reads x-nonce to attach the nonce to its own inline scripts.
  const requestHeaders = trustedRequestHeaders;
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-locale", activeLocale);

  // Apply i18n middleware to get locale redirects / rewrites / cookies
  const intlResponse = intlMiddleware(plainReq);

  // Check auth session
  const session = (req as unknown as { auth?: { user?: { id: string; email?: string; role: UserRole; locale: string; isEmailVerified?: boolean; isOnboarded?: boolean } } }).auth;
  const isPublic = isPublicRoute(pathname);

  if (!session?.user && !isPublic) {
    const locale = pathname.split("/")[1] || defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, req.url);
    loginUrl.searchParams.set("callbackUrl", req.url);
    return withSecurityHeaders(NextResponse.redirect(loginUrl));
  }

  // H4a: OAuth 2FA challenge lock-down. A partial session (pending2fa=true)
  // means the user signed in via OAuth but hasn't yet verified their TOTP code.
  // Until they do, they may ONLY reach:
  //   • /verify-oauth-2fa page (in either locale)
  //   • POST /api/auth/oauth-2fa/verify  (the verify endpoint)
  //   • GET  /api/auth/signout*           (so they can abandon the flow)
  // Anything else: redirect pages to the verify page, 403 every API call.
  const pending2fa = (session?.user as unknown as { pending2fa?: boolean } | undefined)?.pending2fa === true;
  if (pending2fa) {
    const stripped = pathname.replace(/^\/(?:en|ar)/, "") || "/";
    const isVerify2faPage = stripped.startsWith("/verify-oauth-2fa");
    const isVerify2faApi = pathname === "/api/auth/oauth-2fa/verify";
    const isSignoutApi = pathname.startsWith("/api/auth/signout");
    if (isVerify2faPage || isVerify2faApi || isSignoutApi) {
      // Allow through — fall through to the rest of middleware (CSRF etc.).
    } else if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(
        NextResponse.json(
          { error: "Two-factor authentication required", code: "2fa_required" },
          { status: 403 }
        )
      );
    } else {
      const urlLocale = pathname.split("/")[1] || defaultLocale;
      return withSecurityHeaders(
        NextResponse.redirect(new URL(`/${urlLocale}/verify-oauth-2fa`, req.url))
      );
    }
  }

  // Block dashboard access for users with unverified email
  if (session?.user && !isPublic) {
    const stripped = pathname.replace(/^\/(?:en|ar)/, "") || "/";
    const dashboardSections = ["/admin", "/super-agent", "/agent", "/employer", "/job-seeker"];
    const inDashboard = dashboardSections.some((s) => stripped === s || stripped.startsWith(s + "/"));
    const isVerifyPage = stripped.startsWith("/verify-email");
    // Onboarding is intentionally accessible to unverified job seekers: new
    // sign-ups complete their profile (details / CV parsing) first, and email
    // verification is only enforced when they try to reach the dashboard.
    if (inDashboard && !isVerifyPage && session.user.isEmailVerified === false) {
      const urlLocale = pathname.split("/")[1] || defaultLocale;
      const verifyUrl = new URL(`/${urlLocale}/verify-email`, req.url);
      if (session.user.email) {
        verifyUrl.searchParams.set("email", session.user.email);
      }
      return withSecurityHeaders(
        NextResponse.redirect(verifyUrl)
      );
    }
    // Redirect non-onboarded job seekers trying to access the dashboard back to onboarding
    const isJobSeekerDash = stripped.startsWith("/job-seeker");
    if (isJobSeekerDash && session.user.role === "job_seeker" && session.user.isOnboarded === false) {
      const urlLocale = pathname.split("/")[1] || defaultLocale;
      return withSecurityHeaders(
        NextResponse.redirect(new URL(`/${urlLocale}/onboarding`, req.url))
      );
    }
    // Redirect already-onboarded job seekers away from /onboarding to the dashboard
    const isOnboardingPage = stripped.startsWith("/onboarding");
    if (isOnboardingPage && session.user.role === "job_seeker" && session.user.isOnboarded === true) {
      const urlLocale = pathname.split("/")[1] || defaultLocale;
      return withSecurityHeaders(
        NextResponse.redirect(new URL(`/${urlLocale}/job-seeker`, req.url))
      );
    }
  }

  // Redirect authenticated users away from auth pages and the landing page
  if (session?.user && isPublic) {
    const stripped = pathname.replace(/^\/(?:en|ar)/, "") || "/";
    const isAuthRoute = AUTH_ROUTES.some((r) => stripped.startsWith(r));
    const isVerifyEmailRoute = stripped.startsWith("/verify-email");
    const isResetPasswordRoute = stripped.startsWith("/reset-password");
    const hasVerifyToken = req.nextUrl.searchParams.has("token");
    const isRootLanding = stripped === "/";
    // Allow /verify-email if user's email is unverified OR if URL has a token (cross-device verification)
    const exemptVerify = isVerifyEmailRoute && (session.user.isEmailVerified === false || hasVerifyToken);
    // Allow /reset-password if URL has a token (user clicked email link while logged in)
    const exemptReset = isResetPasswordRoute && hasVerifyToken;
    if ((isAuthRoute || isRootLanding) && !exemptVerify && !exemptReset) {
      const role = session.user.role;
      const urlLocale = pathname.split("/")[1] || defaultLocale;
      return withSecurityHeaders(
        NextResponse.redirect(new URL(getDashboardPath(role, urlLocale), req.url))
      );
    }
  }

  // ── Tenant view: let agents/super-agents/admin access /employer/* routes
  // when they have a valid signed tenant-view cookie.
  // We inject x-tenant-* headers so the layout and API routes can read the context.
  //
  // SECURITY: Always strip client-provided x-tenant-* headers first to prevent
  // header injection attacks that could bypass authorization.
  requestHeaders.delete("x-tenant-employer-id");
  requestHeaders.delete("x-tenant-employer-user-id");
  requestHeaders.delete("x-tenant-company-name");
  requestHeaders.delete("x-tenant-actor-role");

  let tenantViewAllowed = false;
  if (session?.user) {
    const strippedForTenant = pathname.replace(/^\/(?:en|ar)/, "") || "/";
    if (strippedForTenant.startsWith("/employer")) {
      const cookieVal = req.cookies.get(TENANT_COOKIE_NAME)?.value;
      const tenantSecret = process.env.NEXTAUTH_SECRET;
      if (cookieVal && tenantSecret) {
        const payload = await verifyTenantCookie(cookieVal, tenantSecret);
        if (payload && payload.actorId === session.user.id) {
          tenantViewAllowed = true;
          requestHeaders.set("x-tenant-employer-id", payload.employerId);
          requestHeaders.set("x-tenant-employer-user-id", payload.employerUserId);
          requestHeaders.set("x-tenant-company-name", payload.companyName);
          requestHeaders.set("x-tenant-actor-role", session.user.role);
        }
      }
    }
  }

  // Enforce role-based dashboard route access
  if (session?.user && !tenantViewAllowed && !isRoleAllowed(session.user.role, pathname)) {
    const role = session.user.role;
    const urlLocale = pathname.split("/")[1] || defaultLocale;
    return withSecurityHeaders(
      NextResponse.redirect(new URL(getDashboardPath(role, urlLocale), req.url))
    );
  }

  // If intl wants to redirect (locale detection), honour it and add security headers
  if (intlResponse && intlResponse.status >= 300 && intlResponse.status < 400) {
    return withSecurityHeaders(intlResponse as unknown as NextResponse);
  }

  // Build the page response with x-nonce forwarded to the Next.js app.
  // Using NextResponse.next({ request: { headers } }) is how middleware
  // passes modified request headers to the application layer.
  const response = NextResponse.next({ request: { headers: requestHeaders } });

  // Copy locale cookies and any rewrite header that intl set
  if (intlResponse) {
    const rewrite = intlResponse.headers.get("x-middleware-rewrite");
    if (rewrite) response.headers.set("x-middleware-rewrite", rewrite);
    intlResponse.headers.forEach((value, key) => {
      if (key.toLowerCase() === "set-cookie") {
        response.headers.append("set-cookie", value);
      }
    });
  }

  withPageSecurityHeaders(response, nonce);

  // Set CSRF cookie on page responses so client JS can read it
  setCsrfCookie(response, plainReq);

  return response;
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|llms\\.txt|manifest\\.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
