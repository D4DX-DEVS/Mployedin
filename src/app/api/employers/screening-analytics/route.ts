import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import Job from "@/models/Job";
import Employer from "@/models/Employer";

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

  const questions = (job as Record<string, unknown>).screeningQuestions as { id: string; label: string; type: string; options?: string[] }[] ?? [];

  // Get all applications with screening answers
  const applications = await Application.find({
    jobId,
    screeningAnswers: { $exists: true, $ne: [] },
  })
    .select("screeningAnswers")
    .lean();

  // Aggregate answers per question
  const analytics = questions.map((q) => {
    const answers = applications
      .map((app: Record<string, unknown>) =>
        ((app as Record<string, unknown>).screeningAnswers as { questionId: string; answer: string }[])
          ?.find((a) => a.questionId === q.id)
      )
      .filter(Boolean);

    const totalResponses = answers.length;

    // For options-based questions, count frequency
    let distribution: Record<string, number> | undefined;
    if (q.options?.length && ["select", "radio", "checkbox"].includes(q.type)) {
      distribution = {};
      for (const opt of q.options) {
        distribution[opt] = 0;
      }
      for (const ans of answers) {
        const val = ans!.answer;
        if (val in distribution!) {
          distribution![val]++;
        } else {
          distribution!["Other"] = (distribution!["Other"] ?? 0) + 1;
        }
      }
    }

    // For text questions, show sample answers
    let sampleAnswers: string[] | undefined;
    if (["text", "textarea"].includes(q.type)) {
      sampleAnswers = answers.slice(0, 10).map((a) => a!.answer);
    }

    // For number questions, compute average
    let numericStats: { avg: number; min: number; max: number } | undefined;
    if (q.type === "number") {
      const nums = answers.map((a) => parseFloat(a!.answer)).filter((n) => !isNaN(n));
      if (nums.length > 0) {
        numericStats = {
          avg: Math.round(nums.reduce((s, n) => s + n, 0) / nums.length),
          min: Math.min(...nums),
          max: Math.max(...nums),
        };
      }
    }

    return {
      questionId: q.id,
      label: q.label,
      type: q.type,
      totalResponses,
      distribution,
      sampleAnswers,
      numericStats,
    };
  });

  return NextResponse.json({
    jobId,
    jobTitle: (job as Record<string, unknown>).title,
    totalApplications: applications.length,
    questions: analytics,
  });
});
