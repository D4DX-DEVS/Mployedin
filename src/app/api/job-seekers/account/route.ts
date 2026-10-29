/**
 * GDPR account endpoints for job seekers.
 *
 * GET  /api/job-seekers/account  — Export all personal data as JSON (GDPR Art. 20)
 * DELETE /api/job-seekers/account — Anonymise / erase personal data (GDPR Art. 17)
 *
 * Erasure is eraseUserPersonalData, the admin path's own function: the account is
 * anonymised and deactivated, the profile emptied, and files deleted.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { User } from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { eraseUserPersonalData } from "@/lib/gdpr/erasure";

// ── GET — data export ─────────────────────────────────────────────────────────

export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const [user, profile] = await Promise.all([
    User.findById(ctx.userId).lean(),
    JobSeeker.findOne({ userId: ctx.userId }).lean(),
  ]);

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  logActivity({
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "gdpr.export",
    resource: "account",
  });

  return NextResponse.json({
    exportedAt: new Date().toISOString(),
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      phone: user.phone,
      locale: user.locale,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    profile: profile ?? null,
  });
});

// ── DELETE — anonymise / erase ────────────────────────────────────────────────

export const DELETE = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();

  try {
    // The same erasure an admin completes for a deletion request (lib/gdpr/erasure.ts): one function, so the two
    // paths can't drift apart again. This route once kept the name, skills and disability details and left the
    // CV file in storage.
    await eraseUserPersonalData(ctx.userId);

    logActivity({
      actorId: ctx.userId,
      actorRole: ctx.role,
      action: "gdpr.erasure",
      resource: "account",
      meta: { erasedAt: now.toISOString() },
    });

    logger.info({ userId: ctx.userId }, "GDPR erasure completed");

    return NextResponse.json({ success: true, erasedAt: now.toISOString() });
  } catch (err) {
    logger.error({ err, userId: ctx.userId }, "GDPR erasure failed");
    return NextResponse.json({ error: "Erasure failed" }, { status: 500 });
  }
});
