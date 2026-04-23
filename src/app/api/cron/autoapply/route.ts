import { NextRequest, NextResponse } from "next/server";
import { verifyCronRequest } from "@/lib/security/cron-auth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import { inngest } from "@/lib/inngest/client";

/**
 * POST /api/cron/autoapply
 *
 * Called by Vercel Cron every 30 minutes.
 * Triggers auto-apply queue for all active auto-apply users.
 *
 * TODO: DISABLED — auto-apply feature is planned for future release.
 */
export async function POST(req: NextRequest) {
  const authError = verifyCronRequest(req);
  if (authError) return authError;

  // Feature disabled — return early
  return NextResponse.json({ error: "Auto-apply feature is not yet available" }, { status: 503 });

  // TODO: Re-enable when auto-apply feature is ready
  // await connectDB();
  //
  // const seekers = await JobSeeker.find({ applicationMode: "auto" })
  //   .select("userId")
  //   .lean();
  //
  // if (seekers.length === 0) {
  //   return NextResponse.json({ triggered: 0 });
  // }
  //
  // // Fan out one event per seeker
  // await inngest.send(
  //   seekers.map((s) => ({
  //     name: "job-seeker/auto-apply.cron" as const,
  //     data: { userId: String(s.userId), trigger: "cron" },
  //   }))
  // );
  //
  // return NextResponse.json({ triggered: seekers.length });
}
