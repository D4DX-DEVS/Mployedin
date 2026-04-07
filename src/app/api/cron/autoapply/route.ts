import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/cron/autoapply
 *
 * Called by Vercel Cron every 30 minutes.
 * Triggers auto-apply queue for all active auto-apply users.
 */
export const POST = withAuth(async (_req: NextRequest, ctx) => {
  // Allow admin or internal cron (role check is flexible)
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const seekers = await JobSeeker.find({ applicationMode: "auto" })
    .select("userId")
    .lean();

  if (seekers.length === 0) {
    return NextResponse.json({ triggered: 0 });
  }

  // Fan out one event per seeker
  await inngest.send(
    seekers.map((s) => ({
      name: "job-seeker/auto-apply.cron" as const,
      data: { userId: String(s.userId), trigger: "cron" },
    }))
  );

  return NextResponse.json({ triggered: seekers.length });
});
