import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { getDashboardPath } from "@/lib/permissions/matrix";
import { safeCallbackPath } from "@/lib/routing/callbackUrl";
import { attachJobSeekerReferral } from "@/lib/referrals/attachJobSeeker";
import { REFERRAL_COOKIE_NAME, normalizeReferralCode } from "@/lib/referrals/url";
import { REFERRAL_QUERY_PARAM } from "@/lib/auth/oauthRedirect";
import { SIGNUP_CONSENT_COOKIE, parseSignupConsent } from "@/lib/auth/signupConsent";
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
 * The referral code from /register?ref= is claimed here: the redirect OAuth
 * flow (LinkedIn / Apple) has no other server hop that sees both the new
 * account and the browser's cookies. The code rides in `mpl_signup_consent`,
 * which the register page writes when the visitor clicks LinkedIn / Apple (no
 * cookie is written on arrival), or in this URL's own `?ref=` when the sign-up
 * started on the login page. The helper's account-age window is what stops
 * a returning user from claiming a code, and an unknown or malformed code is
 * ignored without failing the sign-in.
 *
 * This route is a plain GET and the session cookie is SameSite=Lax, so another
 * website can send a signed-in visitor here with any `?ref=`. The query code is
 * therefore honoured ONLY next to our own Terms tick in this browser (the
 * `mpl_signup_consent` cookie): without that tick it is ignored entirely.
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
  const query = new URL(request.url).searchParams;
  const requestedCallback = query.get("callbackUrl");
  const safeCallback = safeCallbackPath(requestedCallback, locale);

  const cookieHeader = request.headers.get("cookie") ?? "";
  const consentCookie = readCookie(cookieHeader, SIGNUP_CONSENT_COOKIE);
  // ponytail: legacy `mpl_ref` cookie (set by the previous release on arrival). Nothing writes it
  // any more; remove this read, the clear below and REFERRAL_COOKIE_NAME after one release.
  const refCookie = readCookie(cookieHeader, REFERRAL_COOKIE_NAME);
  // In this order: the code inside the consent cookie (written on the register page's LinkedIn / Apple
  // click), this URL's own ?ref= (the login page's OAuth start) but ONLY when the consent cookie shows
  // our own Terms tick (see the note on top: any other site can send a visitor here with a ?ref=), then
  // the legacy cookie. One normalisation path: anything not shaped like a code is dropped, and the
  // attach helper then checks that it exists, its audience, expiry and the account's age.
  const consent = parseSignupConsent(consentCookie);
  const code =
    consent.ref ||
    (consent.terms ? normalizeReferralCode(query.get(REFERRAL_QUERY_PARAM)) : "") ||
    normalizeReferralCode(refCookie);
  if (code && role === "job_seeker" && user.id) {
    try {
      await attachJobSeekerReferral({ userId: user.id, code });
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
  // The sign-up consent tick has done its job once the account exists.
  if (consentCookie !== null) {
    const secure = request.url.startsWith("https:");
    response.cookies.set(SIGNUP_CONSENT_COOKIE, "", { path: "/", maxAge: 0, ...(secure ? { secure: true, sameSite: "none" as const } : {}) });
  }
  return response;
}
