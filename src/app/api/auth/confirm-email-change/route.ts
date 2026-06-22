import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { sendEmail, EmailTemplates } from "@/lib/communications/email";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";

const schema = z.object({
  token: z.string().min(1).max(128),
});

/**
 * POST /api/auth/confirm-email-change
 * Validate the email-change token (sent to the NEW address) and apply the change.
 * Public — the link may be opened in a different browser/session.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const { allowed } = await checkRateLimit(`confirm-email-change:${ip}`, { limit: 10, windowSec: 300, prefix: "cemch" });
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
    emailChangeToken: hashedToken,
    emailChangeExpires: { $gt: new Date() },
    isActive: true,
  }).select("+emailChangeToken +emailChangeExpires +pendingEmail email name role");

  if (!user || !user.pendingEmail) {
    return NextResponse.json(
      { error: "Invalid or expired confirmation link" },
      { status: 400 }
    );
  }

  // Re-check uniqueness — the address may have been registered since the request.
  const taken = await User.exists({ email: user.pendingEmail, _id: { $ne: user._id } });
  if (taken) {
    user.pendingEmail = undefined;
    user.emailChangeToken = undefined;
    user.emailChangeExpires = undefined;
    await user.save();
    return NextResponse.json({ error: "This email address is no longer available" }, { status: 409 });
  }

  const oldEmail = user.email;
  const newEmail = user.pendingEmail;

  user.email = newEmail;
  user.isEmailVerified = true; // confirmed via link to the new address
  user.pendingEmail = undefined;
  user.emailChangeToken = undefined;
  user.emailChangeExpires = undefined;
  await user.save();

  logActivity({
    actorId: user._id.toString(),
    actorRole: user.role,
    action: "email_change.completed",
    resource: "auth",
    meta: { from: oldEmail, to: newEmail },
    req,
  });

  // Best-effort: notify the OLD address that the change took effect.
  sendEmail({ to: oldEmail, ...EmailTemplates.emailChangeCompleted(user.name || "there", newEmail) }).catch((err) => {
    logger.warn({ err, userId: String(user._id) }, "Email change: completion notice failed");
  });

  return NextResponse.json({ success: true, email: newEmail });
}
