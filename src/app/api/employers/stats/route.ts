import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";
import { Placement } from "@/models/Placement";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

// GET /api/employers/stats — dashboard KPIs for current employer
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!employer) {
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });
  }

  const employerId = employer._id;

  const [
    activeJobs,
    totalApplications,
    scheduledInterviews,
    placements,
  ] = await Promise.all([
    Job.countDocuments({ employerId, status: "active", deletedAt: null }),
    Application.countDocuments({ employerId }),
    Interview.countDocuments({ employerId, status: "scheduled" }),
    Placement.countDocuments({ employerId }),
  ]);

  return NextResponse.json({
    stats: {
      activeJobs,
      totalApplications,
      scheduledInterviews,
      placements,
    },
  });
}

export const GET = withAuth(getHandler);
