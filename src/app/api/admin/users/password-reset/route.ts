import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { adminUserPasswordResetSchema } from "@/lib/validators/admin";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { checkRateLimit } from "@/lib/security/rateLimit";
import { issuePasswordReset } from "@/lib/auth/passwordReset";

/**
 * POST /api/admin/users/password-reset
 * Body: { userId: string } — email that account a fresh reset link.
 *
 * Deliberately not the public forgot-password route with the target's address
 * posted into it: that one answers "If an account exists…" to every request so
 * it cannot leak who has an account, which leaves an admin unable to tell a
 * sent mail from a silently skipped one. It is also rate limited per IP at 5
 * requests, so an admin working through a handful of stuck accounts would trip
 * a limit meant for anonymous traffic.
 *
 * Here the target is known, so the answers can be specific — including the
 * refusal below: reset-password only accepts a token for an active account, so
 * mailing a link to a deactivated user would send a link that can never be
 * redeemed.
 */
export const POST = withAuth(
  async (req: NextRequest, ctx) => {
    if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { allowed } = await checkRateLimit(`admin-pwd-reset:${ctx.userId}`, {
      limit: 20,
      windowSec: 300,
      prefix: "apwd",
      failClosed: true,
    });
    if (!allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    await connectDB();
    const { userId } = (await validateBody(req, adminUserPasswordResetSchema)) as { userId: string };

    const user = await User.findById(userId);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!user.isActive) {
      return NextResponse.json(
        { error: "This account is deactivated, so a reset link could not be redeemed. Activate it first." },
        { status: 409 },
      );
    }

    const { delivered } = await issuePasswordReset(user, { actor: actorFromCtx(ctx), req });

    await logActivity({
      ...actorFromCtx(ctx),
      action: "user.password_reset_sent",
      resource: "users",
      resourceId: String(userId),
      meta: { email: user.email, delivered },
      req,
    });

    if (!delivered) {
      return NextResponse.json(
        { error: "We couldn't send the reset email. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ message: "Password reset email sent.", email: user.email });
  },
  { resource: "users", action: "update" },
);
