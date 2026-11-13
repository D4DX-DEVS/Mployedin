import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import type { AuthContext } from "@/lib/auth/withAuth";
import User from "@/models/User";

/**
 * GET /api/user/password-status
 *
 * `temporaryPassword` is true while the signed-in person still uses a password
 * someone else issued them (an agent converting a lead into an employer
 * account). The dashboard then offers — never forces — a change; setting a new
 * password clears the flag.
 *
 * `hasPassword` is false for an account made by an e-mail code or by Google /
 * Apple / LinkedIn. The apply page and Settings then offer to set a first
 * password (POST /api/users/set-password). Only the boolean leaves the server.
 *
 * Answers for the real person: a colleague is `ctx.member.actorId` (withAuth
 * swaps ctx.userId to the company owner), and a staff member browsing an
 * employer in tenant view is never shown the employer's notice.
 */
async function handler(_req: NextRequest, ctx: AuthContext) {
  if (ctx.tenantView) return NextResponse.json({ temporaryPassword: false, hasPassword: true });
  await connectDB();
  const user = await User.findById(ctx.member?.actorId ?? ctx.userId)
    .select("tempPasswordIssuedAt +passwordHash")
    .lean();
  return NextResponse.json({
    temporaryPassword: Boolean(user?.tempPasswordIssuedAt),
    hasPassword: Boolean(user?.passwordHash),
  });
}

export const GET = withAuth(handler);
