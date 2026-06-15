import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { routeGenerate } from "@/lib/ai/router";
import { connectDB } from "@/lib/db/mongoose";
import { Application } from "@/models/Application";
import Job from "@/models/Job";
import { JobSeeker } from "@/models/JobSeeker";
import { Employer } from "@/models/Employer";

const VALID_CONTEXTS = [
  "after_application",
  "after_shortlist",
  "after_interview",
  "after_rejection",
  "after_offer",
  "follow_up_general",
] as const;

type EmailContext = (typeof VALID_CONTEXTS)[number];

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userRole = (session.user as unknown as { role: string }).role;
    if (!["employer", "agent", "super_agent", "admin"].includes(userRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const userId = (session.user as unknown as { id: string }).id ?? ip;
    const { allowed, remaining, resetAt } = checkRateLimit(
      `ai-email-draft:${userId}`,
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

    const body = await req.json();
    const { applicationId, context, customInstructions } = body as {
      applicationId?: string;
      context?: string;
      customInstructions?: string;
    };

    if (!applicationId || !/^[a-f\d]{24}$/i.test(applicationId)) {
      return NextResponse.json({ error: "Valid applicationId is required" }, { status: 400 });
    }

    if (!context || !VALID_CONTEXTS.includes(context as EmailContext)) {
      return NextResponse.json(
        { error: `context must be one of: ${VALID_CONTEXTS.join(", ")}` },
        { status: 400 }
      );
    }

    await connectDB();

    const application = await Application.findById(applicationId)
      .populate({ path: "jobId", select: "title location requirements employerId", populate: { path: "employerId", select: "companyName" } })
      .populate({ path: "jobSeekerId", select: "fullName userId skills currentLocation", populate: { path: "userId", select: "name" } })
      .lean();

    if (!application) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const app = application as unknown as {
      status: string;
      aiMatchScore?: number;
      jobId?: { title?: string; location?: { city?: string; country?: string }; employerId?: { companyName?: string } };
      jobSeekerId?: { fullName?: string; userId?: { name?: string }; skills?: string[]; currentLocation?: string };
    };

    const candidateName = app.jobSeekerId?.userId?.name || app.jobSeekerId?.fullName || "Candidate";
    const candidateFirstName = candidateName.split(/\s+/)[0] || candidateName;
    const companyName = app.jobId?.employerId?.companyName || "our company";
    const jobTitle = app.jobId?.title ?? "the position";
    const jobLocation = [app.jobId?.location?.city, app.jobId?.location?.country].filter(Boolean).join(", ") || "";

    const contextDescriptions: Record<EmailContext, string> = {
      after_application: "The candidate just applied. Write a warm acknowledgment that confirms receipt and sets timeline expectations.",
      after_shortlist: "The candidate has been shortlisted. Write an encouraging email that shares next steps.",
      after_interview: "The interview just concluded. Write a thank-you and status update email.",
      after_rejection: "The candidate was not selected. Write a professional, empathetic rejection that preserves the relationship.",
      after_offer: "An offer has been extended. Write a congratulatory email summarizing key details.",
      follow_up_general: "It's time for a general follow-up. Write a check-in email to keep the candidate engaged.",
    };

    const customNote = customInstructions?.slice(0, 300) ?? "";

    const prompt = `You are a professional recruitment email writer for the Gulf/MENA market.

Generate a follow-up email draft for this context:

CONTEXT: ${contextDescriptions[context as EmailContext]}
${customNote ? `ADDITIONAL INSTRUCTIONS: ${customNote}` : ""}

CANDIDATE: ${candidateName}
CANDIDATE FIRST NAME: ${candidateFirstName}
JOB: ${jobTitle}${jobLocation ? ` in ${jobLocation}` : ""}
HIRING COMPANY: ${companyName}
APPLICATION STATUS: ${app.status}
${app.aiMatchScore ? `AI MATCH SCORE: ${app.aiMatchScore}/100` : ""}

Generate a JSON response with:
- subject: email subject line
- body: professional email body (use <br> for line breaks, address the candidate by their first name)
- tone: "formal" | "warm" | "encouraging" | "empathetic"
- suggestedSendTime: "immediately" | "next_morning" | "end_of_day"

IMPORTANT: Use the ACTUAL values provided above. Do NOT output bracketed placeholders such as [Candidate Name], [Company Name], [Your Name], or [Position] — always substitute the real candidate first name, job title, and "${companyName}". Sign off as the ${companyName} recruitment team.
Keep the email concise (100-200 words), professional, and culturally appropriate for the Gulf region.
Output ONLY valid JSON, no markdown code blocks.`;

    const rawText = await routeGenerate(prompt, "chat");

    let parsed: unknown;
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      parsed = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    // Safety net: replace any placeholders the model left behind with known values.
    const fillPlaceholders = (text: unknown): unknown => {
      if (typeof text !== "string") return text;
      return text
        .replace(/\[\s*(candidate(?:'s)?\s*(?:full\s*)?name|applicant(?:'s)?\s*name)\s*\]/gi, candidateName)
        .replace(/\[\s*(?:candidate(?:'s)?\s*)?first\s*name\s*\]/gi, candidateFirstName)
        .replace(/\[\s*(company(?:'s)?\s*name|hiring\s*company|organization(?:'s)?\s*name)\s*\]/gi, companyName)
        .replace(/\[\s*(?:job\s*title|position|role)\s*\]/gi, jobTitle)
        .replace(/\[\s*(?:your\s*name|recruiter(?:'s)?\s*name|sender(?:'s)?\s*name|hiring\s*manager)\s*\]/gi, `${companyName} recruitment team`);
    };

    const parsedObj = (parsed && typeof parsed === "object") ? parsed as Record<string, unknown> : {};
    if ("subject" in parsedObj) parsedObj.subject = fillPlaceholders(parsedObj.subject);
    if ("body" in parsedObj) parsedObj.body = fillPlaceholders(parsedObj.body);

    return NextResponse.json(
      {
        applicationId,
        candidateName,
        jobTitle,
        companyName,
        context,
        ...parsedObj,
      },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    console.error("[Email Draft Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
