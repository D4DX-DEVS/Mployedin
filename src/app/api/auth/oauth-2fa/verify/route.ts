/**
 * POST /api/auth/oauth-2fa/verify
 *
 * Completes the OAuth 2FA challenge started in lib/auth/config.ts (H4a).
 *
 * Flow:
 *   1. User signs in via OAuth (Google/LinkedIn/Apple).
 *   2. If the existing DB user has TOTP 2FA enrolled, the jwt callback issues a
 *      PARTIAL session: token.pending2fa=true + pending2faUserId=<id>, but no
 *      identity fields. Middleware redirects them to /verify-oauth-2fa.
 *   3. This endpoint is reached while the partial session is active. It:
 *        a. Reads the session via auth() — must have pending2fa=true.
 *        b. Rate-limits TOTP guesses per pending user (6-digit brute force).
 *        c. Verifies the TOTP code (or a single-use recovery code) against the
 *           stored 2FA secret / recovery hashes.
 *        d. On success, re-encodes the JWT with the full identity (id, role,
 *           locale, etc.) and clears pending2fa, then Set-Cookie's the new
 *           session token. The user is now fully authenticated.
 *
 * SECURITY: This route is exempted from withAuth (it uses auth() directly and
 * is reachable when session.user.id is empty). CSRF protection still applies —
 * the verify page (a Server Component that renders the CSRF token via the
 * cookie set on GET) sends x-csrf-token.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { encode } from "next-auth/jwt";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { decrypt } from "@/lib/security/encryption";
import { verifyTotp, hashRecoveryCode } from "@/lib/security/totp";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import type { UserRole } from "@/types/user";
import { z } from "zod";

const verifySchema = z.object({
  code: z.string().trim().min(6).max(100),
});

/**
 * Compute the NextAuth v5 session-cookie name for the current environment.
 * In production (HTTPS), NextAuth prefixes with `__Secure-`. The salt used by
 * encode() matches the cookie name (this is the v5 convention).
 */
function sessionCookieName(): string {
  const isSecure = process.env.NODE_ENV === "production";
  return isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";
}

/** Build the identity fields that the jwt callback normally sets on full sign-in. */
async function buildIdentityToken(userId: string, provider: string) {
  const dbUser = await User.findById(userId).select(
    "_id role locale email isEmailVerified permissionMode customPermissions avatar name isOnboarded isActive"
  ).lean();
  if (!dbUser) throw new Error("User not found");
  if (!dbUser.isActive) throw new Error("Account deactivated");

  // Mirror the field layout produced by the jwt callback in config.ts so the
  // session callback (which reads these token fields) populates session.user
  // identically to a normal OAuth sign-in.
  return {
    // Fresh token — DO NOT carry over pending2fa / pending2faUserId.
    pending2fa: undefined as unknown as undefined,
    pending2faUserId: undefined as unknown as undefined,
    // Identity:
    id: dbUser._id.toString(),
    role: dbUser.role as UserRole,
    locale: dbUser.locale ?? "en",
    provider,
    isEmailVerified: dbUser.isEmailVerified ?? true,
    isOnboarded: false, // job_seekers populate this in jwt callback; initialised neutral here
    permissionMode: (dbUser.permissionMode as string) ?? "role_default",
    customPermissions: (dbUser.customPermissions as Record<string, string[]> | undefined) ?? undefined,
    name: dbUser.name,
    email: dbUser.email,
    picture: dbUser.avatar,
    // Refresh password-changed-at cache so existing session invalidation logic
    // still works (token.pca is consulted on subsequent jwt callbacks).
    pca: null as number | null,
  };
}

export async function POST(req: NextRequest) {
  // ── 1. Auth: must be a partial pending-2FA session ─────────────────────
  const session = await auth();
  const pending2fa = (session?.user as unknown as { pending2fa?: boolean } | undefined)?.pending2fa === true;
  const pending2faUserId = (session?.user as unknown as { pending2faUserId?: string } | undefined)?.pending2faUserId;
  if (!pending2fa || !pending2faUserId) {
    return NextResponse.json(
      { error: "No pending two-factor challenge. Please sign in again." },
      { status: 400 }
    );
  }

  // ── 2. Validate body ────────────────────────────────────────────────────
  let body: z.infer<typeof verifySchema>;
  try {
    body = verifySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // ── 3. Per-user TOTP brute-force throttle (6-digit codes must be unbreakable).
  const rl = await checkRateLimit(`oauth-2fa:${pending2faUserId}`, { limit: 8, windowSec: 300, prefix: "oauth-2fa" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  await connectDB();

  // ── 4. Load user + verify TOTP / recovery code ──────────────────────────
  const user = await User.findById(pending2faUserId)
    .select("+twoFactorSecretEnc +twoFactorRecoveryCodes twoFactorEnabled role email isActive");
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecretEnc) {
    // The user no longer has 2FA enrolled (e.g. disabled in another session).
    // Force re-auth — they should sign in fresh.
    return NextResponse.json(
      { error: "Two-factor authentication is no longer enabled for this account. Please sign in again." },
      { status: 400 }
    );
  }

  const secret = decrypt(user.twoFactorSecretEnc);
  let verified = verifyTotp(secret, body.code);

  // Single-use recovery codes (hashed in DB). Matches the credentials flow.
  let recoveryUsed = false;
  if (!verified) {
    const codeHash = hashRecoveryCode(body.code);
    if ((user.twoFactorRecoveryCodes ?? []).includes(codeHash)) {
      await User.findByIdAndUpdate(user._id, { $pull: { twoFactorRecoveryCodes: codeHash } });
      verified = true;
      recoveryUsed = true;
      logActivity({
        actorId: user._id.toString(),
        actorRole: user.role,
        action: "2fa.recovery_code_used",
        resource: "auth",
        meta: { provider: "oauth" },
      });
    }
  }

  if (!verified) {
    logActivity({
      actorId: user._id.toString(),
      actorRole: user.role,
      action: "login.failed",
      resource: "auth",
      meta: { email: user.email, reason: "oauth_2fa_invalid" },
    });
    return NextResponse.json(
      { error: "Invalid verification code", code: "2fa_invalid" },
      { status: 400 }
    );
  }

  // ── 5. Re-encode the JWT with the full identity and Set-Cookie ─────────
  // The provider is preserved on the original token but not surfaced via the
  // session; we read it back from the current JWT cookie via getToken.
  let provider = "oauth";
  try {
    const { getToken } = await import("next-auth/jwt");
    const currentToken = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (currentToken?.provider && typeof currentToken.provider === "string") {
      provider = currentToken.provider;
    }
  } catch {
    // Non-critical — fall back to generic "oauth".
  }

  const newToken = await buildIdentityToken(pending2faUserId, provider);
  const jwtSecret = process.env.NEXTAUTH_SECRET;
  if (!jwtSecret) {
    // Should never happen — validateEnv() enforces NEXTAUTH_SECRET at boot.
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  const cookieName = sessionCookieName();
  const encoded = await encode({
    token: newToken,
    secret: jwtSecret,
    salt: cookieName,
    maxAge: 3 * 24 * 60 * 60, // mirror session.maxAge (3 days)
  });

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "login.success",
    resource: "auth",
    meta: { email: user.email, provider, via: recoveryUsed ? "oauth_2fa_recovery" : "oauth_2fa" },
  });

  const response = NextResponse.json({
    ok: true,
    recoveryCodeConsumed: recoveryUsed,
  });
  response.cookies.set(cookieName, encoded, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 3 * 24 * 60 * 60,
  });
  return response;
}
