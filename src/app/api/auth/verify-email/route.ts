import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import crypto from "crypto";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { logActivity } from "@/lib/audit/log";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(1).max(128),
});

/**
 * POST /api/auth/verify-email
 * Validate email verification token and mark user as verified.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = await checkRateLimit(`verify-email:${ip}`, { limit: 10, windowSec: 300, prefix: "vemail" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  await connectDB();

  const hashedToken = crypto.createHash("sha256").update(body.token).digest("hex");

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    isActive: true,
  }).select("+emailVerificationToken +emailVerificationExpiry");

  if (!user || (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date())) {
    return NextResponse.json(
      { error: "Invalid or expired verification token" },
      { status: 400 }
    );
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpiry = undefined;
  await user.save();

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "email.verified",
    resource: "auth",
    meta: { email: user.email },
    req,
  });

  return NextResponse.json({ message: "Email verified successfully" });
}
