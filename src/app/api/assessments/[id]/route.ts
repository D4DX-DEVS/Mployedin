import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import SkillAssessment from "@/models/SkillAssessment";
import AssessmentAttempt from "@/models/AssessmentAttempt";
import { z } from "zod";
import { validateBody } from "@/lib/validators";

const submitAnswersSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string(),
    answer: z.string(),
  })),
});

/**
 * GET /api/assessments/[id] — Get assessment detail
 */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  await connectDB();
  const assessment = await SkillAssessment.findById(params?.id).lean();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  // Job seekers don't see correct answers
  if (ctx.role === "job_seeker") {
    const sanitized = {
      ...(assessment as Record<string, unknown>),
      questions: ((assessment as Record<string, unknown>).questions as Record<string, unknown>[])?.map((q) => ({
        ...q,
        correctAnswer: undefined,
        explanation: undefined,
      })),
    };
    return NextResponse.json({ assessment: sanitized });
  }

  return NextResponse.json({ assessment });
});

/**
 * POST /api/assessments/[id] — Submit assessment attempt (job_seeker only)
 */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Only job seekers can take assessments" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, submitAnswersSchema);
  const assessment = await SkillAssessment.findById(params?.id).lean();
  if (!assessment) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });

  // Check attempt count
  const existingAttempts = await AssessmentAttempt.countDocuments({
    assessmentId: params?.id,
    userId: ctx.userId,
    status: "completed",
  });

  if (existingAttempts >= Number((assessment as Record<string, unknown>).attemptsAllowed)) {
    return NextResponse.json({ error: "Maximum attempts reached" }, { status: 400 });
  }

  // Grade the assessment
  const questions = (assessment as Record<string, unknown>).questions as { id: string; correctAnswer?: string; points: number }[];
  const gradedAnswers = body.answers.map((a) => {
    const question = questions.find((q) => q.id === a.questionId);
    if (!question) return { questionId: a.questionId, answer: a.answer, isCorrect: false, pointsEarned: 0 };

    const isCorrect = question.correctAnswer
      ? a.answer.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()
      : false;

    return {
      questionId: a.questionId,
      answer: a.answer,
      isCorrect,
      pointsEarned: isCorrect ? question.points : 0,
    };
  });

  const totalScore = gradedAnswers.reduce((sum, a) => sum + a.pointsEarned, 0);
  const totalPoints = (assessment as Record<string, unknown>).totalPoints as number;
  const percentage = totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0;
  const passed = percentage >= ((assessment as Record<string, unknown>).passingScore as number);

  const attempt = await AssessmentAttempt.create({
    assessmentId: params?.id,
    userId: ctx.userId,
    answers: gradedAnswers,
    totalScore,
    percentage,
    passed,
    startedAt: new Date(),
    completedAt: new Date(),
    status: "completed",
  });

  // Update assessment stats
  await SkillAssessment.findByIdAndUpdate(params?.id, {
    $inc: { totalAttempts: 1 },
  });

  // Recalculate avg score
  const avgResult = await AssessmentAttempt.aggregate([
    { $match: { assessmentId: assessment._id, status: "completed" } },
    { $group: { _id: null, avg: { $avg: "$percentage" } } },
  ]);
  if (avgResult[0]) {
    await SkillAssessment.findByIdAndUpdate(params?.id, { avgScore: Math.round(avgResult[0].avg) });
  }

  return NextResponse.json({
    attempt,
    result: { totalScore, percentage, passed, totalPoints },
  }, { status: 201 });
});
