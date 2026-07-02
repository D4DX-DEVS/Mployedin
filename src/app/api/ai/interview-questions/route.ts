import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { connectDB } from "@/lib/db/mongoose";
import { InterviewQuestion } from "@/models/InterviewQuestion";
import { validateBody } from "@/lib/validators";
import { aiInterviewQuestionsSchema } from "@/lib/validators/ai";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";

const QUESTION_TYPES = ["technical", "behavioral", "culture_fit", "situational"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Subscription feature gate
    const userRole = (session.user as unknown as { role: string }).role;
    const gateErr = await enforceFeatureGate(session.user.id!, userRole, { type: "ai", feature: "ai_interview_questions" });
    if (gateErr) return gateErr;

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { allowed, remaining, resetAt } = await checkRateLimit(
      `ai-interview:${(session.user as unknown as { id: string }).id ?? ip}`,
      RATE_LIMIT_CONFIGS.ai
    );
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((resetAt - Date.now()) / 1000)),
          },
        }
      );
    }

    const __aiQuota = await enforceDailyAiQuota(session.user.id!, userRole);
    if (__aiQuota) return __aiQuota;

    const body = await validateBody(req, aiInterviewQuestionsSchema);
    const jobTitle = sanitizeAIInput(body.jobTitle, 200);
    const candidateName = body.candidateName ? sanitizeAIInput(body.candidateName, 200) : undefined;
    const interviewId = body.interviewId ?? undefined;
    const skills = body.skills
      ? body.skills.map((s) => sanitizeAIInput(s, 50))
      : [];
    const experienceYears = body.experienceYears ?? 3;
    const questionType: QuestionType = body.questionType ?? "technical";
    const count = body.count;

    if (!jobTitle) {
      return NextResponse.json({ error: "jobTitle is required" }, { status: 400 });
    }

    const typeDescriptions: Record<QuestionType, string> = {
      technical:
        "hard-skills and domain-knowledge questions testing technical expertise",
      behavioral:
        "STAR-format questions (Situation, Task, Action, Result) testing past behaviour and soft skills",
      culture_fit:
        "values and team-alignment questions assessing culture and working style",
      situational:
        "hypothetical scenario questions testing decision-making and problem-solving",
    };

    const prompt = `Generate ${count} ${typeDescriptions[questionType]} interview questions for a ${jobTitle} role.

Candidate profile:
- Required skills: ${skills.length ? skills.join(", ") : "not specified"}
- Experience level: ${experienceYears} years

For EACH question, provide:
1. The question text
2. What it tests / why it matters (1 sentence)
3. What a strong answer looks like (2-3 sentences)
4. One red flag to watch for (1 sentence)

Format as JSON array:
[
  {
    "question": "...",
    "tests": "...",
    "strongAnswer": "...",
    "redFlag": "..."
  }
]

Output ONLY the JSON array, no markdown code blocks.`;

    const rawText = (await generateText(prompt, GEMINI_MODELS.flash, 3000)).trim();

    let questions: unknown[] = [];
    try {
      // Strip possible ```json fences
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      questions = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    // Persist generated questions if interviewId provided
    let savedId: string | undefined;
    if (interviewId) {
      try {
        await connectDB();
        const doc = await InterviewQuestion.create({
          interviewId,
          generatedBy: (session.user as unknown as { id: string }).id,
          questionType,
          questions,
          jobTitle,
          candidateName,
        });
        savedId = doc._id.toString();
      } catch (saveErr) {
        logger.error({ err: saveErr }, "[Interview Questions Save Error]");
        // Don't fail the request – still return the generated questions
      }
    }

    await logActivity({
      actorId: (session.user as unknown as { id: string }).id,
      actorRole: userRole,
      action: "ai.interview_questions_generate",
      resource: "ai",
      meta: { jobTitle, questionType, count: questions.length },
      req,
    });

    return NextResponse.json(
      { questions, jobTitle, questionType, count: questions.length, savedId },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    logger.error({ err }, "[Interview Questions Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET /api/ai/interview-questions?interviewId=xxx — fetch all saved question sets */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const interviewId = req.nextUrl.searchParams.get("interviewId");
    if (!interviewId) {
      return NextResponse.json({ error: "interviewId is required" }, { status: 400 });
    }

    await connectDB();

    const saved = await InterviewQuestion.find({ interviewId })
      .sort({ createdAt: -1 })
      .lean();

    // Group by questionType, newest first
    const byType: Record<string, typeof saved> = {};
    for (const doc of saved) {
      const key = doc.questionType;
      if (!byType[key]) byType[key] = [];
      byType[key].push(doc);
    }

    return NextResponse.json({ history: byType });
  } catch (err) {
    logger.error({ err }, "[Interview Questions GET Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
