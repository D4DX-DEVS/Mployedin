import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const requestSchema = z.object({
  newEmail: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  );
}

/** GET /api/user/email-change — pending change status for the current user. */
async function getHandler(_req: NextRequest, ctx: AuthContext) {
  await connectDB();
  const user = await User.findById(ctx.userId)
    .select("email +pendingEmail +emailChangeExpires")
    .lean();
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const pending =
    user.pendingEmail && user.emailChangeExpires && user.emailChangeExpires > new Date()
      ? user.pendingEmail
      : null;

  return NextResponse.json({ email: user.email, pendingEmail: pending });
}

/**
 * POST /api/user/email-change — request an email change.
 * Requires the current password. Sends a confirmation link to the NEW
 * address and a security notice to the CURRENT address. The email only
 * changes once the link is confirmed.
 *
 * DELETE /api/user/email-change — cancel a pending change.
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  const rl = await checkRateLimit(`email-change:${ctx.userId}`, { limit: 3, windowSec: 600, prefix: "emch" });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();

  const user = await User.findById(ctx.userId).select("+passwordHash email name role");
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "Email change is not available for social-login accounts" },
      { status: 400 }
    );
  }

  const passwordOk = await user.comparePassword(body.password);
  if (!passwordOk) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  const newEmail = body.newEmail.toLowerCase().trim();
  if (newEmail === user.email) {
    return NextResponse.json({ error: "This is already your email address" }, { status: 400 });
  }

  const taken = await User.exists({ email: newEmail });
  if (taken) {
    return NextResponse.json({ error: "This email address is not available" }, { status: 409 });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

  user.pendingEmail = newEmail;
  user.emailChangeToken = hashedToken;
  user.emailChangeExpires = new Date(Date.now() + TOKEN_TTL_MS);
  await user.save();

  const confirmUrl = `${baseUrl()}/${ctx.locale ?? "en"}/confirm-email-change?token=${rawToken}`;

  try {
    // Verification link → NEW address; security notice → CURRENT address.
    await Promise.all([
      sendEmail({ to: newEmail, ...EmailTemplates.emailChangeVerify(user.name || "there", confirmUrl, newEmail) }),
      sendEmail({ to: user.email, ...EmailTemplates.emailChangeNotice(user.name || "there", newEmail) }),
    ]);
  } catch (err) {
    logger.error({ err, userId: ctx.userId }, "Email change: failed to send emails");
    // Roll back the pending state so the UI doesn't show a dead pending change.
    await User.findByIdAndUpdate(ctx.userId, {
      $unset: { pendingEmail: 1, emailChangeToken: 1, emailChangeExpires: 1 },
    }).catch((rollbackErr) => { logger.error({ err: rollbackErr, userId: ctx.userId }, "Failed to rollback pending email change"); });
    return NextResponse.json({ error: "Failed to send verification email. Try again later." }, { status: 502 });
  }

  logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "email_change.requested",
    resource: "auth",
    meta: { from: user.email, to: newEmail },
    req,
  });

  return NextResponse.json({ success: true, pendingEmail: newEmail });
}

async function deleteHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();
  await User.findByIdAndUpdate(ctx.userId, {
    $unset: { pendingEmail: 1, emailChangeToken: 1, emailChangeExpires: 1 },
  });
  logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "email_change.cancelled",
    resource: "auth",
    req,
  });
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
export const DELETE = withAuth(deleteHandler);
