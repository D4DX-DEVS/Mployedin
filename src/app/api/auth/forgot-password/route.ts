import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { issuePasswordReset } from "@/lib/auth/passwordReset";
import { z } from "zod";
import logger from "@/lib/logger";
import { getClientIp } from "@/lib/security/clientIp";

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

/**
 * POST /api/auth/forgot-password
 * Generate a password reset token and send reset email.
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req.headers);
  const { allowed } = await checkRateLimit(`forgot-pwd:${ip}`, { limit: 5, windowSec: 300, prefix: "fpwd", failClosed: true });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  await connectDB();
  const account = await User.findOne({ email: body.email });
  const user = account?.isActive ? account : null;

  // Always return success to prevent email enumeration. The caller learns nothing,
  // but the server log must still say WHY nothing was sent — a silent no-op here is
  // indistinguishable from a failed send when someone reports "no mail arrived".
  if (!user) {
    logger.info(
      { email: body.email, reason: !account ? "no_account" : "account_inactive" },
      "[ForgotPassword] No reset email sent",
    );
    return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
  }

  // Token minting, TTL and delivery are shared with the admin-triggered reset
  // (POST /api/admin/users/password-reset) so both produce a link the
  // reset-password route will accept.
  await issuePasswordReset(user, {
    actor: { actorId: user._id.toString(), actorRole: user.role },
    req,
  });

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "password_reset.requested",
    resource: "auth",
    meta: { email: body.email },
    req,
  });

  return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
}
