import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import {
  aggregateScreeningAnswers,
  type ScreeningApplicationInput,
  type ScreeningQuestionInput,
} from "@/lib/screeningAnalytics";

/**
 * GET /api/employers/screening-analytics — Aggregate screening question answer stats
 * Query: ?jobId=xxx
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "employer" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get("jobId");

  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // Verify job belongs to employer
  if (ctx.role === "employer") {
    const employer = await Employer.findOne({ userId: ctx.userId }).lean();
    if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });
    const job = await Job.findById(jobId).lean();
    if (!job || String((job as Record<string, unknown>).employerId) !== String((employer as Record<string, unknown>)._id)) {
      return NextResponse.json({ error: "Job not found or unauthorized" }, { status: 404 });
    }
  }

  // Get the job's screening questions
  const job = await Job.findById(jobId).select("screeningQuestions title").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const questions = (job as Record<string, unknown>).screeningQuestions as ScreeningQuestionInput[] ?? [];

  // Applications that answered at least one question. The aggregation drops
  // blank answers itself, so a row here is a candidate, not a response.
  const applications = await Application.find({
    jobId,
    screeningAnswers: { $exists: true, $ne: [] },
  })
    .select("screeningAnswers")
    .lean<ScreeningApplicationInput[]>();

  const analytics = aggregateScreeningAnswers(questions, applications);

  return NextResponse.json({
    jobId,
    jobTitle: (job as Record<string, unknown>).title,
    totalApplications: applications.length,
    questions: analytics,
  });
});
