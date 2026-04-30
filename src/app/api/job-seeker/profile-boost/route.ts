import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";

/**
 * POST /api/job-seeker/profile-boost — Boost profile visibility for 7 days
 * GET /api/job-seeker/profile-boost — Get boost status
 */
export const GET = withAuth(async (_req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("isProfileBoosted profileBoostedUntil profileBoostCount headline")
    .lean();

  if (!seeker) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const s = seeker as Record<string, unknown>;
  const isActive = s.isProfileBoosted && s.profileBoostedUntil && new Date(s.profileBoostedUntil as string) > new Date();

  return NextResponse.json({
    isActive,
    boostedUntil: isActive ? s.profileBoostedUntil : null,
    boostCount: s.profileBoostCount ?? 0,
    headline: s.headline,
  });
});

export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const seeker = await JobSeeker.findOne({ userId: ctx.userId });
  if (!seeker) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  // Check if already boosted
  if (seeker.isProfileBoosted && seeker.profileBoostedUntil && seeker.profileBoostedUntil > new Date()) {
    return NextResponse.json({ error: "Profile is already boosted", boostedUntil: seeker.profileBoostedUntil }, { status: 400 });
  }

  // Parse optional headline update from body
  let headline: string | undefined;
  try {
    const body = await req.json();
    if (body.headline && typeof body.headline === "string") {
      headline = body.headline.slice(0, 150);
    }
  } catch { /* no body */ }

  const boostedUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const update: Record<string, unknown> = {
    isProfileBoosted: true,
    profileBoostedUntil: boostedUntil,
    $inc: { profileBoostCount: 1 },
  };
  if (headline) update.headline = headline;

  await JobSeeker.findByIdAndUpdate(seeker._id, update);

  return NextResponse.json({
    success: true,
    boostedUntil,
    message: "Profile boosted for 7 days! You'll appear higher in search results.",
  });
});
