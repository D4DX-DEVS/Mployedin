/**
 * GET /api/subscriptions/my
 *
 * Returns the current user's active subscription + usage.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import Job from "@/models/Job";
import { Employer } from "@/models/Employer";
import { CompanyUser } from "@/models/CompanyUser";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  // Determine targetRole from user role
  const targetRole =
    ctx.role === "employer"
      ? "employer"
      : ctx.role === "job_seeker"
        ? "job_seeker"
        : null;

  if (!targetRole) {
    // Admin/agent roles don't have subscriptions
    return NextResponse.json({ subscription: null });
  }

  const subscription = await Subscription.findOne({
    userId: ctx.userId,
    targetRole,
    status: "active",
  }).lean();

  // What the employer actually has right now. `usage.activeJobs` is a counter
  // of jobs created this period that never goes down, and team members were
  // never counted, so the page read "0 / 2" beside 21 live jobs (QA EMP-006).
  const liveUsage = targetRole === "employer" ? await employerLiveUsage(ctx.userId) : undefined;

  return NextResponse.json({ subscription: subscription ?? null, ...(liveUsage ? { liveUsage } : {}) });
}

async function employerLiveUsage(userId: string): Promise<{ activeJobs: number; teamMembers: number } | undefined> {
  const employer = await Employer.findOne({ userId }).select("_id").lean();
  if (!employer) return undefined;
  const [activeJobs, teamMembers] = await Promise.all([
    Job.countDocuments({ employerId: employer._id, status: "active", deletedAt: null }),
    // Colleagues holding or invited to a seat; the owner is not one of them.
    CompanyUser.countDocuments({ companyId: employer._id, companyRole: { $ne: "owner" }, status: { $in: ["active", "pending"] } }),
  ]);
  return { activeJobs, teamMembers };
}

export const GET = withAuth(handler, {
  resource: "subscriptions",
  action: "read",
});
