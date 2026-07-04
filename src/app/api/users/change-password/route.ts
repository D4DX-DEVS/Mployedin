import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import connectDB from "@/lib/db/mongoose";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { validateBody } from "@/lib/validators";
import { changePasswordSchema } from "@/lib/validators/misc";
import { logActivity } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";

/**
 * POST /api/users/change-password
 * Body: { currentPassword: string, newPassword: string }
 * Requires authenticated session.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await checkRateLimit(`change-pwd:${session.user.id}`, {
    limit: 3,
    windowSec: 3600,
    prefix: "chpwd",
    failClosed: true,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { currentPassword, newPassword } = await validateBody(req, changePasswordSchema);

  await connectDB();

  // Fetch user WITH passwordHash (select: false by default)
  const user = await User.findById(session.user.id).select("+passwordHash");
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (!user.passwordHash) {
    return NextResponse.json(
      { error: "Password login not configured for this account (OAuth user)" },
      { status: 400 }
    );
  }

  // Verify current password
  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isMatch) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  // Hash new password and save
  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  logActivity({
    actorId: session.user.id,
    actorRole: (session.user as { role?: string }).role ?? "unknown",
    action: "user.change_password",
    resource: "users",
    resourceId: session.user.id,
    req,
  });

  return NextResponse.json({ success: true });
}
