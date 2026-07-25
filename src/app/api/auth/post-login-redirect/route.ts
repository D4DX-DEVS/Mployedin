import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { getDashboardPath } from "@/lib/permissions/matrix";
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
export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    // No session — send back to login
    return NextResponse.redirect(new URL("/en/login", process.env.NEXTAUTH_URL ?? "http://localhost:3000"));
  }

  const user = session.user as {
    role?: UserRole;
    locale?: string;
    isOnboarded?: boolean;
  };

  const role: UserRole = user.role ?? "job_seeker";
  const locale = user.locale ?? "en";
  const isOnboarded = user.isOnboarded ?? false;
  const requestedCallback = new URL(request.url).searchParams.get("callbackUrl");
  const safeCallback =
    requestedCallback &&
    !requestedCallback.startsWith("//") &&
    requestedCallback.startsWith(`/${locale}/`)
      ? requestedCallback
      : null;

  // Job seekers who haven't completed onboarding go to the onboarding flow
  const destination =
    role === "job_seeker" && !isOnboarded
      ? `/${locale}/onboarding`
      : safeCallback ?? getDashboardPath(role, locale);

  return NextResponse.redirect(
    new URL(destination, process.env.NEXTAUTH_URL ?? "http://localhost:3000"),
  );
}
