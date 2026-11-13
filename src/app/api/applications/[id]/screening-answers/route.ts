import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { logActivity } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { z } from "zod";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

const submitScreeningAnswersSchema = z.object({
  answers: z.array(
    z.object({
      questionId: z.string().min(1).max(50),
      questionLabel: z.string().min(1).max(500),
      answer: z.union([
        z.string().max(2000),
        z.array(z.string().max(200)),
        z.boolean(),
      ]),
    })
  ).min(1).max(50),
});

/**
 * GET /api/applications/[id]/screening-answers
 * Retrieve screening questions for an application (if not yet answered).
 * Job seeker can retrieve their own application's screening questions.
 */
async function getHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  await connectDB();

  const { id } = params ?? {};

  // Only job seekers can answer screening questions
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Find the job seeker for this user
  const jobSeeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("_id")
    .lean();
  if (!jobSeeker) {
    return NextResponse.json(
      { error: "Job seeker profile not found" },
      { status: 404 }
    );
  }

  // Fetch application with job details
  const application = await Application.findById(id)
    .select(
      "_id jobSeekerId jobId screeningAnswers screeningRequestedAt screeningAnsweredAt"
    )
    .populate("jobId", "title screeningQuestions");

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Verify ownership
  if (String(application.jobSeekerId) !== String(jobSeeker._id)) {
    return NextResponse.json(
      { error: "This is not your application" },
      { status: 403 }
    );
  }

  // Check if screening was requested
  if (!application.screeningRequestedAt) {
    return NextResponse.json(
      { error: "Screening questions have not been sent for this application" },
      { status: 400 }
    );
  }

  // If already answered, return existing answers
  if (application.screeningAnsweredAt) {
    return NextResponse.json({
      answered: true,
      answers: application.screeningAnswers,
      answeredAt: application.screeningAnsweredAt,
    });
  }

  // Return screening questions from the job
  const job = application.jobId as unknown as {
    title?: string;
    screeningQuestions?: unknown[];
  } | null;

  return NextResponse.json({
    answered: false,
    jobTitle: job?.title,
    screeningQuestions: job?.screeningQuestions || [],
  });
}

/**
 * PATCH /api/applications/[id]/screening-answers
 * Submit screening answers for an application.
 * Job seeker submits their screening answers.
 */
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  await connectDB();

  const id = params?.id;

  // Only job seekers can answer screening questions
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Find the job seeker for this user
  const jobSeeker = await JobSeeker.findOne({ userId: ctx.userId })
    .select("_id")
    .lean();
  if (!jobSeeker) {
    return NextResponse.json(
      { error: "Job seeker profile not found" },
      { status: 404 }
    );
  }

  const body = await validateBody(req, submitScreeningAnswersSchema);
  const { answers } = body;

  // Fetch application
  const application = await Application.findById(id);

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  // Verify ownership
  if (String(application.jobSeekerId) !== String(jobSeeker._id)) {
    return NextResponse.json(
      { error: "This is not your application" },
      { status: 403 }
    );
  }

  // Check if screening was requested
  if (!application.screeningRequestedAt) {
    return NextResponse.json(
      { error: "Screening questions have not been sent for this application" },
      { status: 400 }
    );
  }

  // Check if already answered
  if (application.screeningAnsweredAt) {
    return NextResponse.json(
      { error: "You have already answered the screening questions" },
      { status: 400 }
    );
  }

  try {
    // Update application with screening answers
    application.screeningAnswers = answers;
    application.screeningAnsweredAt = new Date();
    await application.save();

    // Log activity
    await logActivity({
      actorId: ctx.userId,
      actorRole: "job_seeker",
      action: "screening_answered",
      resource: "application",
      resourceId: String(application._id),
    });

    return NextResponse.json({
      success: true,
      answeredAt: application.screeningAnsweredAt,
    });
  } catch (error) {
    logger.error({ error, appId: id }, "Error submitting screening answers");
    return NextResponse.json(
      { error: "We couldn't save your screening answers. Try again." },
      { status: 500 }
    );
  }
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
