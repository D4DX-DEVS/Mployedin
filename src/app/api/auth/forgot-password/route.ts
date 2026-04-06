import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";

const schema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
});

/**
 * POST /api/auth/forgot-password
 * Generate a password reset token and send reset email.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = checkRateLimit(`forgot-pwd:${ip}`, { limit: 5, windowSec: 300, prefix: "fpwd" });
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
  const user = await User.findOne({ email: body.email, isActive: true });

  // Always return success to prevent email enumeration
  if (!user) {
    return NextResponse.json({ message: "If an account exists, a reset link has been sent." });
  }

  // Generate secure token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  user.passwordResetToken = hashedToken;
  user.passwordResetExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await user.save();

  // TODO: Send actual email with reset link containing `resetToken`
  // For now, log the token in development
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Password reset token for ${body.email}: ${resetToken}`);
  }

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
