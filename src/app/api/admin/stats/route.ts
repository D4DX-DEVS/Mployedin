import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Interview from "@/models/Interview";

export const GET = withAuth(async (_req: NextRequest) => {
  await connectDB();

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalUsers,
    newUsersThisMonth,
    totalJobs,
    activeJobs,
    pendingApprovals,
    totalApplications,
    applicationsThisMonth,
    totalInterviews,
    usersByRole,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Job.countDocuments(),
    Job.countDocuments({ status: "active" }),
    Job.countDocuments({ "poster.approvalStatus": "pending" }),
    Application.countDocuments(),
    Application.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    Interview.countDocuments(),
    User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  return NextResponse.json({
    users: { total: totalUsers, newThisMonth: newUsersThisMonth },
    jobs: { total: totalJobs, active: activeJobs, pendingApprovals },
    applications: { total: totalApplications, thisMonth: applicationsThisMonth },
    interviews: { total: totalInterviews },
    usersByRole,
  });
}, { resource: "users", action: "read" });
