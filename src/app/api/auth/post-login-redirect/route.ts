import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { getDashboardPath } from "@/lib/permissions/matrix";
import { safeCallbackPath } from "@/lib/routing/callbackUrl";
import { attachJobSeekerReferral } from "@/lib/referrals/attachJobSeeker";
import { REFERRAL_CODE_RE, REFERRAL_COOKIE_NAME } from "@/lib/referrals/url";
import logger from "@/lib/logger";
import type { UserRole } from "@/types/user";

/**
 * GET /api/auth/post-login-redirect
 *
 * After OAuth (LinkedIn / Google) callback, NextAuth redirects here.
 * We read the session, determine the user's role, and 302-redirect
 * to the correct landing page:
 *   - job_seeker (not onboarded) → /[locale]/onboarding
 *   - job_seeker (onboarded)     → /[locale]/job-seeker
 *   - employer                   → /[locale]/employer
 *   - agent                      → /[locale]/agent
 *   - super_agent                → /[locale]/super-agent
 *   - admin                      → /[locale]/admin
 */
/**
 * The `mpl_ref` cookie set by /register?ref= is claimed here: the redirect
 * OAuth flow (LinkedIn / Apple) has no other server hop that sees both the new
 * account and the browser's cookies. The helper's account-age window is what
 * stops a returning user from claiming a code.
 */
function readCookie(header: string, name: string): string | null {
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(rest.join("=")); } catch { return null; }
    }
  }
  return null;
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    // No session — send back to login
    return NextResponse.redirect(new URL("/en/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const user = session.user as {
    id?: string;
    role?: UserRole;
    locale?: string;
    isOnboarded?: boolean;
  };

  const role: UserRole = user.role ?? "job_seeker";
  const locale = user.locale ?? "en";
  const isOnboarded = user.isOnboarded ?? false;
  const requestedCallback = new URL(request.url).searchParams.get("callbackUrl");
  const safeCallback = safeCallbackPath(requestedCallback, locale);

  const refCookie = readCookie(request.headers.get("cookie") ?? "", REFERRAL_COOKIE_NAME);
  if (refCookie && role === "job_seeker" && user.id && REFERRAL_CODE_RE.test(refCookie.trim().toUpperCase())) {
    try {
      await attachJobSeekerReferral({ userId: user.id, code: refCookie });
    } catch (err) {
      logger.error({ err }, "[post-login-redirect] Referral attach threw");
    }
  }

  // A valid callback always wins — even over onboarding.
  // If the callback is present and valid, go there (they applied from a job link).
  // Otherwise, for non-onboarded job seekers, go to onboarding.
  // For others, go to the role dashboard.
  const destination =
    safeCallback ?? (role === "job_seeker" && !isOnboarded ? `/${locale}/onboarding` : getDashboardPath(role, locale));

  const response = NextResponse.redirect(
    new URL(destination, process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  );
  if (refCookie !== null) {
    response.cookies.set(REFERRAL_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  }
  return response;
}
