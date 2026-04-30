import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SkillAssessment from "@/models/SkillAssessment";
import AssessmentAttempt from "@/models/AssessmentAttempt";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const questionSchema = z.object({
  id: z.string(),
  question: z.string().min(1).max(2000),
  type: z.enum(["multiple_choice", "true_false", "short_answer", "code"]),
  options: z.array(z.string().max(500)).optional(),
  correctAnswer: z.string().optional(),
  points: z.number().min(1),
  timeLimit: z.number().min(10).optional(),
  codeLanguage: z.string().optional(),
  explanation: z.string().max(1000).optional(),
  order: z.number().default(0),
});

const createAssessmentSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(1000).optional(),
  skills: z.array(z.string()).min(1),
  questions: z.array(questionSchema).min(1).max(50),
  passingScore: z.number().min(1).max(100).default(60),
  timeLimit: z.number().min(5).max(180).default(30),
  attemptsAllowed: z.number().min(1).max(5).default(1),
  jobIds: z.array(z.string()).optional(),
});

/**
 * GET /api/assessments — List assessments
 * - Employer: their own assessments
 * - Job Seeker: assessments linked to jobs they applied to
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(20, parseInt(searchParams.get("limit") ?? "10"));

  if (ctx.role === "employer") {
    // Get employer's assessments
    const Employer = (await import("@/models/Employer")).default;
    const employer = await Employer.findOne({ userId: ctx.userId }).lean();
    if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

    const filter = { employerId: (employer as Record<string, unknown>)._id };
    const [assessments, total] = await Promise.all([
      SkillAssessment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SkillAssessment.countDocuments(filter),
    ]);

    return NextResponse.json({ assessments, total, page, totalPages: Math.ceil(total / limit) });
  }

  if (ctx.role === "job_seeker") {
    // Get assessments for jobs they applied to
    const jobId = searchParams.get("jobId");
    const filter: Record<string, unknown> = { isActive: true };
    if (jobId) filter.jobIds = jobId;

    const assessments = await SkillAssessment.find(filter)
      .select("title description skills totalPoints passingScore timeLimit attemptsAllowed")
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    // Get user's attempts
    const attempts = await AssessmentAttempt.find({ userId: ctx.userId })
      .select("assessmentId status totalScore percentage passed")
      .lean();

    const attemptMap = new Map<string, Record<string, unknown>[]>();
    for (const a of attempts) {
      const key = String(a.assessmentId);
      if (!attemptMap.has(key)) attemptMap.set(key, []);
      attemptMap.get(key)!.push(a as unknown as Record<string, unknown>);
    }

    const result = assessments.map((assessment) => ({
      ...assessment,
      myAttempts: attemptMap.get(String(assessment._id)) ?? [],
    }));

    return NextResponse.json({ assessments: result });
  }

  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
});

/**
 * POST /api/assessments — Create assessment (employer only)
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Only employers can create assessments" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, createAssessmentSchema);

  const Employer = (await import("@/models/Employer")).default;
  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const totalPoints = body.questions.reduce((sum, q) => sum + q.points, 0);

  const assessment = await SkillAssessment.create({
    ...body,
    employerId: (employer as Record<string, unknown>)._id,
    totalPoints,
  });

  return NextResponse.json({ assessment }, { status: 201 });
});
