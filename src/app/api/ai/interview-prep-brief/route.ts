import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { routeGenerate, invalidateAICache } from "@/lib/ai/router";
import { connectDB } from "@/lib/db/mongoose";
import Interview from "@/models/Interview";
import Job from "@/models/Job";
import { JobSeeker } from "@/models/JobSeeker";
import { Application } from "@/models/Application";

function parseJsonResponse(raw: string): unknown {
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}");
  if (jsonStart !== -1 && jsonEnd > jsonStart) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }
  return JSON.parse(cleaned);
}

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
    const userId = (session.user as unknown as { id: string }).id ?? ip;
    const { allowed, remaining, resetAt } = await checkRateLimit(
      `ai-prep-brief:${userId}`,
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

    const __aiQuota = await enforceDailyAiQuota(session.user.id as string, (session.user as { role: string }).role);
    if (__aiQuota) return __aiQuota;

    const body = await req.json();
    const { interviewId } = body as { interviewId?: string };

    if (!interviewId || !/^[a-f\d]{24}$/i.test(interviewId)) {
      return NextResponse.json({ error: "Valid interviewId is required" }, { status: 400 });
    }

    await connectDB();

    const interview = await Interview.findById(interviewId)
      .populate("jobId", "title requirements salary location description")
      .populate("jobSeekerId", "firstName lastName skills experience education languages currentLocation totalExperienceYears")
      .populate("applicationId", "aiMatchScore matchBreakdown strengths gaps coverLetter")
      .lean();

    if (!interview) {
      return NextResponse.json({ error: "Interview not found" }, { status: 404 });
    }

    const iv = interview as unknown as {
      interviewRound: number;
      type: string;
      duration: number;
      scheduledAt: Date;
      jobId?: {
        title?: string;
        requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number };
        location?: { city?: string; country?: string; isRemote?: boolean };
        description?: string;
      };
      jobSeekerId?: {
        firstName?: string;
        lastName?: string;
        skills?: string[];
        experience?: Array<{ jobTitle?: string; company?: string; years?: number }>;
        education?: Array<{ degree?: string; field?: string; institution?: string }>;
        languages?: Array<{ language?: string; proficiency?: string }>;
        currentLocation?: string;
        totalExperienceYears?: number;
      };
      applicationId?: {
        aiMatchScore?: number;
        matchBreakdown?: { skills: number; experience: number; location: number; language: number };
        strengths?: string[];
        gaps?: string[];
        coverLetter?: string;
      };
    };

    const candidateName = [iv.jobSeekerId?.firstName, iv.jobSeekerId?.lastName].filter(Boolean).join(" ") || "Unknown";
    const jobTitle = iv.jobId?.title ?? "Unknown role";

    const prompt = `You are a recruitment agency interview preparation expert for Gulf/MENA market.

Generate a comprehensive interview prep brief for the following scheduled interview.

INTERVIEW DETAILS:
- Round: ${iv.interviewRound}
- Type: ${iv.type}
- Duration: ${iv.duration} minutes
- Scheduled: ${new Date(iv.scheduledAt).toLocaleDateString()}

JOB:
- Title: ${jobTitle}
- Required Skills: ${(iv.jobId?.requirements?.skills ?? []).join(", ") || "Not specified"}
- Experience: ${iv.jobId?.requirements?.experienceMin ?? 0}–${iv.jobId?.requirements?.experienceMax ?? 99} years
- Location: ${iv.jobId?.location?.isRemote ? "Remote" : [iv.jobId?.location?.city, iv.jobId?.location?.country].filter(Boolean).join(", ") || "Not specified"}

CANDIDATE:
- Name: ${candidateName}
- Location: ${iv.jobSeekerId?.currentLocation ?? "Unknown"}
- Total Experience: ${iv.jobSeekerId?.totalExperienceYears ?? 0} years
- Skills: ${(iv.jobSeekerId?.skills ?? []).slice(0, 15).join(", ") || "Not listed"}
- Latest Roles: ${(iv.jobSeekerId?.experience ?? []).slice(0, 3).map((e) => `${e.jobTitle ?? "N/A"} at ${e.company ?? "N/A"}`).join("; ") || "Not listed"}
- Education: ${(iv.jobSeekerId?.education ?? []).slice(0, 2).map((e) => `${e.degree ?? ""} ${e.field ?? ""} (${e.institution ?? ""})`).join("; ") || "Not listed"}
- Languages: ${(iv.jobSeekerId?.languages ?? []).map((l) => l.language).join(", ") || "Not listed"}

AI MATCH DATA:
- Match Score: ${iv.applicationId?.aiMatchScore ?? "Not scored"}
- Strengths: ${(iv.applicationId?.strengths ?? []).join("; ") || "Not analyzed"}
- Gaps: ${(iv.applicationId?.gaps ?? []).join("; ") || "Not analyzed"}

Generate a JSON response with:
- candidateSummary: 2-3 sentence overview of the candidate
- keyStrengths: array of 3 top strengths to explore
- areasToProbe: array of 3 areas requiring deeper assessment
- suggestedQuestions: array of 5 objects with { question, purpose, followUp }
- redFlags: array of 1-2 potential concerns to watch for
- interviewStrategy: 2-3 sentence recommended approach for this interview
- timeAllocation: object with { intro, technical, behavioral, questions, closing } in minutes (must sum to ${iv.duration})

Output ONLY valid JSON, no markdown code blocks.`;

    const aiOptions = { jsonMode: true, maxTokens: 4000 };

    let rawText: string;
    try {
      rawText = await routeGenerate(prompt, "chat", aiOptions);
    } catch (aiErr) {
      console.error("[Prep Brief AI Error]", aiErr);
      return NextResponse.json(
        { error: "AI service unavailable. Please try again." },
        { status: 503 }
      );
    }

    let parsed: unknown;
    try {
      parsed = parseJsonResponse(rawText);
    } catch {
      // Invalidate cached truncated response and retry
      console.warn("[Prep Brief Parse Error] Retrying... Raw:", rawText.slice(0, 200));
      await invalidateAICache("chat", prompt);
      try {
        const retryText = await routeGenerate(prompt, "chat", aiOptions);
        parsed = parseJsonResponse(retryText);
      } catch {
        console.error("[Prep Brief Parse Error] Retry also failed. Raw:", rawText.slice(0, 500));
        return NextResponse.json(
          { error: "Failed to parse AI response. Please retry." },
          { status: 422 }
        );
      }
    }

    return NextResponse.json(
      {
        interviewId,
        candidateName,
        jobTitle,
        round: iv.interviewRound,
        type: iv.type,
        duration: iv.duration,
        scheduledAt: iv.scheduledAt,
        ...parsed as object,
      },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[Interview Prep Brief Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export const maxDuration = 30;
