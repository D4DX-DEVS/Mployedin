import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { JobSeeker } from "@/models/JobSeeker";
import { validateBody } from "@/lib/validators";
import { aiScreenCandidatesSchema } from "@/lib/validators/ai";
import { logActivity } from "@/lib/audit/log";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Subscription feature gate
    const userRole = (session.user as unknown as { role: string }).role;
    const gateErr = await enforceFeatureGate(session.user.id!, userRole, { type: "ai", feature: "ai_candidate_screening" });
    if (gateErr) return gateErr;

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("x-real-ip") ??
      "unknown";
    const { allowed, remaining, resetAt } = checkRateLimit(
      `ai-screening:${(session.user as unknown as { id: string }).id ?? ip}`,
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

    const body = await validateBody(req, aiScreenCandidatesSchema);
    const jobId = body.jobId;
    const maxCandidates = body.maxCandidates;

    if (!jobId) {
      return NextResponse.json({ error: "jobId is required" }, { status: 400 });
    }

    await connectDB();

    const job = await Job.findById(jobId)
      .select("title requirements salary location employerId")
      .lean();

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Ownership check — user must be the employer or admin
    const userId = (session.user as unknown as { id: string }).id;
    if (userRole !== "admin") {
      const { Employer } = await import("@/models/Employer");
      const employer = await Employer.findOne({ userId }).select("_id").lean();
      if (
        !employer ||
        (job as { employerId?: { toString(): string } }).employerId?.toString() !==
          (employer as { _id: { toString(): string } })._id.toString()
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Fetch applications with seeker profiles (limit for cost control)
    const applications = await Application.find({ jobId })
      .limit(maxCandidates)
      .select("jobSeekerId status appliedAt")
      .lean();

    if (!applications.length) {
      return NextResponse.json({ candidates: [], message: "No applications found" });
    }

    const seekerIds = applications.map((a) => (a as { jobSeekerId: unknown }).jobSeekerId);
    const seekers = await JobSeeker.find({ _id: { $in: seekerIds } })
      .select("firstName lastName skills experience education languages")
      .lean();

    // Build structured candidate summaries for the AI
    const candidateSummaries = seekers.map((s) => {
      const seeker = s as {
        _id: { toString(): string };
        firstName?: string;
        lastName?: string;
        skills?: string[];
        experience?: Array<{ jobTitle?: string; years?: number }>;
        education?: Array<{ degree?: string; field?: string }>;
        languages?: Array<{ language?: string; proficiency?: string }>;
      };
      const totalYears = (seeker.experience ?? []).reduce(
        (acc, e) => acc + (e.years ?? 0),
        0
      );
      return {
        id: seeker._id.toString(),
        name: `${seeker.firstName ?? ""} ${seeker.lastName ?? ""}`.trim() || "Unknown",
        skills: (seeker.skills ?? []).slice(0, 20),
        experienceYears: totalYears,
        latestRole: seeker.experience?.[0]?.jobTitle ?? "N/A",
        education: seeker.education?.[0]
          ? `${seeker.education[0].degree ?? ""} in ${seeker.education[0].field ?? ""}`
          : "N/A",
        languages: (seeker.languages ?? []).map((l) => l.language ?? "").filter(Boolean),
      };
    });

    const jobReqs = job as {
      title?: string;
      requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number };
    };

    const prompt = `You are a recruitment screening expert. Score and rank these candidates for the following job.

JOB: ${jobReqs.title ?? "Unknown"}
Required Skills: ${(jobReqs.requirements?.skills ?? []).join(", ") || "not specified"}
Experience: ${jobReqs.requirements?.experienceMin ?? 0}–${jobReqs.requirements?.experienceMax ?? 99} years

CANDIDATES:
${JSON.stringify(candidateSummaries, null, 2)}

Scoring criteria:
- Required skills match: 40%
- Experience level: 25%
- Education: 15%
- Languages: 10%
- Other factors: 10%

For each candidate provide a JSON object with:
- id (from input)
- name
- score (0-100)
- recommendation: "shortlist" | "consider" | "pass"
- strengths: top 3 strengths (array of strings)
- gaps: top 2 gaps or concerns (array of strings)
- summary: one-sentence hiring recommendation

Output ONLY a JSON array, no markdown code blocks, sorted by score descending.`;

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: { maxOutputTokens: 3000 },
    });

    const result = await model.generateContent(prompt);
    const rawText = result.response.text().trim();

    let ranked: unknown[] = [];
    try {
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      ranked = JSON.parse(cleaned);
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response" },
        { status: 502 }
      );
    }

    await logActivity({
      actorId: userId,
      actorRole: userRole,
      action: "ai.candidate_screening",
      resource: "applications",
      resourceId: jobId,
      meta: { totalReviewed: candidateSummaries.length },
      req,
    });

    return NextResponse.json(
      {
        candidates: ranked,
        jobTitle: jobReqs.title,
        totalReviewed: candidateSummaries.length,
      },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    console.error("[Screen Candidates Error]", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
