import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { encrypt, decrypt } from "@/lib/security/encryption";
import {
  generateTotpSecret,
  verifyTotp,
  totpAuthUri,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/security/totp";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";

/** Roles allowed to enroll in TOTP 2FA (high-privilege staff). */
const TWO_FA_ROLES = new Set(["admin", "super_agent"]);

async function rateLimitGuard(ctx: AuthContext): Promise<NextResponse | null> {
  // Tight per-user throttle — TOTP codes are 6 digits, brute force must be impossible.
  const rl = await checkRateLimit(`2fa:${ctx.userId}`, { limit: 10, windowSec: 300, prefix: "2fa" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }
  return null;
}

/** GET /api/user/2fa — enrollment status for the current user. */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const user = await User.findById(ctx.userId).select("twoFactorEnabled twoFactorEnabledAt role").lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json({
    enabled: Boolean(user.twoFactorEnabled),
    enabledAt: user.twoFactorEnabledAt ?? null,
    eligible: TWO_FA_ROLES.has(ctx.role),
  });
}

/**
 * POST /api/user/2fa — action-routed:
 *  { action: "setup" }                    → generate pending secret, return QR + manual key
 *  { action: "verify", code }            → confirm pending secret, enable 2FA, return recovery codes
 *  { action: "disable", code, password } → disable (requires current TOTP/recovery code + password)
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (!TWO_FA_ROLES.has(ctx.role)) {
    return NextResponse.json({ error: "Two-factor authentication is only available for admin and super agent accounts" }, { status: 403 });
  }

  const limited = await rateLimitGuard(ctx);
  if (limited) return limited;

  await connectDB();
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  const user = await User.findById(ctx.userId).select(
    "+twoFactorSecretEnc +twoFactorPendingSecretEnc +twoFactorRecoveryCodes +passwordHash twoFactorEnabled email role"
  );
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // ── setup ────────────────────────────────────────────────────────────────
  if (action === "setup") {
    if (user.twoFactorEnabled) {
      return NextResponse.json({ error: "Two-factor authentication is already enabled" }, { status: 409 });
    }
    const secret = generateTotpSecret();
    user.twoFactorPendingSecretEnc = encrypt(secret);
    await user.save();

    const uri = totpAuthUri(user.email, secret);
    const qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 220 });

    return NextResponse.json({ qrDataUrl, manualKey: secret });
  }

  // ── verify (finish enrollment) ───────────────────────────────────────────
  if (action === "verify") {
    const code = String(body?.code ?? "");
    if (!user.twoFactorPendingSecretEnc) {
      return NextResponse.json({ error: "No pending 2FA setup. Start setup first." }, { status: 400 });
    }
    const secret = decrypt(user.twoFactorPendingSecretEnc);
    if (!verifyTotp(secret, code)) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    const recoveryCodes = generateRecoveryCodes();
    user.twoFactorSecretEnc = user.twoFactorPendingSecretEnc;
    user.twoFactorPendingSecretEnc = undefined;
    user.twoFactorRecoveryCodes = recoveryCodes.map(hashRecoveryCode);
    user.twoFactorEnabled = true;
    user.twoFactorEnabledAt = new Date();
    await user.save();

    logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "2fa.enabled",
      resource: "auth",
      meta: { email: user.email },
    });

    // Recovery codes are shown exactly once.
    return NextResponse.json({ enabled: true, recoveryCodes });
  }

  // ── disable ──────────────────────────────────────────────────────────────
  if (action === "disable") {
    if (!user.twoFactorEnabled || !user.twoFactorSecretEnc) {
      return NextResponse.json({ error: "Two-factor authentication is not enabled" }, { status: 400 });
    }
    const code = String(body?.code ?? "");
    const password = String(body?.password ?? "");

    const passwordOk = await user.comparePassword(password);
    if (!passwordOk) {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }

    const secret = decrypt(user.twoFactorSecretEnc);
    const totpOk = verifyTotp(secret, code);
    const recoveryOk =
      !totpOk &&
      (user.twoFactorRecoveryCodes ?? []).includes(hashRecoveryCode(code));
    if (!totpOk && !recoveryOk) {
      return NextResponse.json({ error: "Invalid verification code" }, { status: 400 });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecretEnc = undefined;
    user.twoFactorPendingSecretEnc = undefined;
    user.twoFactorRecoveryCodes = undefined;
    user.twoFactorEnabledAt = undefined;
    await user.save();

    logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "2fa.disabled",
      resource: "auth",
      meta: { email: user.email, via: totpOk ? "totp" : "recovery_code" },
    });

    return NextResponse.json({ enabled: false });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
