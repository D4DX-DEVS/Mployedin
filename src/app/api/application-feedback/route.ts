import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import ApplicationFeedback from "@/models/ApplicationFeedback";
import Application from "@/models/Application";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const feedbackSchema = z.object({
  applicationId: z.string().min(1),
  rating: z.number().min(1).max(5),
  comment: z.string().max(1000).optional(),
  aspects: z.object({
    communicationRating: z.number().min(1).max(5).optional(),
    processRating: z.number().min(1).max(5).optional(),
    timelinessRating: z.number().min(1).max(5).optional(),
    transparencyRating: z.number().min(1).max(5).optional(),
  }).optional(),
  wouldRecommend: z.boolean().optional(),
});

/**
 * GET /api/application-feedback — Get user's feedback history
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const applicationId = searchParams.get("applicationId");

  if (applicationId) {
    const feedback = await ApplicationFeedback.findOne({ applicationId, userId: ctx.userId }).lean();
    return NextResponse.json({ feedback });
  }

  const feedbacks = await ApplicationFeedback.find({ userId: ctx.userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return NextResponse.json({ feedbacks });
});

/**
 * POST /api/application-feedback — Submit feedback after rejection/hire
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can submit feedback" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, feedbackSchema);

  // Verify the application belongs to this user and is in terminal state
  const application = await Application.findById(body.applicationId).lean();
  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  const app = application as Record<string, unknown>;
  if (String(app.jobSeekerId) !== ctx.userId && String(app.userId) !== ctx.userId) {
    return NextResponse.json({ error: "Not your application" }, { status: 403 });
  }

  const terminalStatuses = ["hired", "rejected", "withdrawn"];
  if (!terminalStatuses.includes(app.status as string)) {
    return NextResponse.json({ error: "Feedback can only be given after a final decision" }, { status: 400 });
  }

  // Check for existing feedback
  const existing = await ApplicationFeedback.findOne({ applicationId: body.applicationId }).lean();
  if (existing) {
    return NextResponse.json({ error: "Feedback already submitted" }, { status: 409 });
  }

  const feedback = await ApplicationFeedback.create({
    applicationId: body.applicationId,
    userId: ctx.userId,
    employerId: app.employerId ?? app.jobId,
    rating: body.rating,
    comment: body.comment,
    aspects: body.aspects,
    wouldRecommend: body.wouldRecommend,
  });

  return NextResponse.json({ feedback, message: "Thank you for your feedback!" }, { status: 201 });
});
