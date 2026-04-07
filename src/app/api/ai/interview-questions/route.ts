import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";

const QUESTION_TYPES = ["technical", "behavioral", "culture_fit", "situational"] as const;
type QuestionType = (typeof QUESTION_TYPES)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { allowed, remaining, resetAt } = checkRateLimit(
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

    const body = await req.json();
    const jobTitle = sanitizeAIInput(String(body.jobTitle ?? ""), 200);
    const skills = Array.isArray(body.skills)
      ? (body.skills as string[]).slice(0, 15).map((s) => sanitizeAIInput(String(s), 50))
      : [];
    const experienceYears = Number(body.experienceYears ?? 3);
    const questionType: QuestionType = QUESTION_TYPES.includes(body.questionType)
      ? (body.questionType as QuestionType)
      : "technical";
    const count = Math.min(Number(body.count ?? 8), 15);

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

    return NextResponse.json(
      { questions, jobTitle, questionType, count: questions.length },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[Interview Questions Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
