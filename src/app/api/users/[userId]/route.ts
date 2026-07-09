import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import { checkRateLimit } from "@/lib/security/rateLimit";
import mongoose from "mongoose";

/**
 * GET /api/users/[userId]
 * Returns public profile info for a user (name, role, avatar, headline/companyName).
 * Used by the messaging UI to render the chat header for pending conversations.
 */
async function handler(req: NextRequest, ctx: { userId: string }, params?: Record<string, string>) {
  // Rate-limit per caller to blunt enumeration of the user/role directory.
  const { allowed } = await checkRateLimit(`user-profile:${ctx.userId}`, { limit: 60, windowSec: 60, prefix: "uprof" });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await connectDB();

  const targetId = params?.userId ?? "";
  if (!targetId || !mongoose.Types.ObjectId.isValid(targetId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const user = await User.findById(targetId).select("name role avatar").lean();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let headline: string | undefined;
  let companyName: string | undefined;

  if (user.role === "job_seeker") {
    const js = await JobSeeker.findOne({ userId: user._id }).select("headline").lean();
    headline = js?.headline;
  } else if (user.role === "employer") {
    const emp = await Employer.findOne({ userId: user._id }).select("companyName logo").lean();
    companyName = emp?.companyName;
    if (!user.avatar && emp?.logo) {
      user.avatar = emp.logo;
    }
  }

  return NextResponse.json({
    user: {
      _id: user._id,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
      headline,
      companyName,
    },
  });
}

export const GET = withAuth(handler);
