import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import { nanoid } from "nanoid";

/**
 * GET /api/user/referral — Get user's referral data and history
 */
async function handler(req: NextRequest, ctx: AuthContext) {
  await connectDB();

  const user = await User.findById(ctx.userId).select("referralCode").lean();
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  let referralCode = (user as Record<string, unknown>).referralCode as string | undefined;

  // Generate code if not exists
  if (!referralCode) {
    referralCode = nanoid(8).toUpperCase();
    await User.updateOne({ _id: ctx.userId }, { $set: { referralCode } });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://mployedin.com";
  const referralLink = `${baseUrl}/register?ref=${referralCode}`;

  // Find users referred by this code
  const referrals = await User.find({ referredBy: referralCode })
    .select("name email isActive createdAt")
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const successful = referrals.filter((r: Record<string, unknown>) => r.isActive).length;

  return NextResponse.json({
    referralCode,
    referralLink,
    totalReferrals: referrals.length,
    successfulReferrals: successful,
    pendingReferrals: referrals.length - successful,
    rewardsEarned: successful * 5, // Simple reward: 5 points per successful referral
    referrals: referrals.map((r: Record<string, unknown>) => ({
      _id: String(r._id),
      name: r.name ?? "Unknown",
      email: r.email,
      status: r.isActive ? "active" : "registered",
      createdAt: r.createdAt,
    })),
  });
}

export const GET = withAuth(handler);
