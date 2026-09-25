import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { enforceDailyAiQuota } from "@/lib/ai/dailyQuota";
import { enforceFeatureGate } from "@/lib/subscription/featureGate";
import { checkRateLimit, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { sanitizeAIInput, sanitizeAiList } from "@/lib/ai/sanitize";
import { generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { JobSeeker } from "@/models/JobSeeker";
import { validateBody } from "@/lib/validators";
import { aiScreenCandidatesSchema } from "@/lib/validators/ai";
import { applicantMatchUpdate, scoreApplicationsOfJob } from "@/lib/matching/scoreApplication";
import type { IQualificationCheck } from "@/models/Application";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";

/**
 * POST /api/ai/screen-candidates — rank a job's applicants and explain them.
 *
 * The ranking, the score and the shortlist / consider / pass call come from the
 * ATS score every other surface shows (lib/matching/scoreApplication.ts): the
 * employer's weights, the requirements checklist, one number per candidate.
 * The model used to invent its own 0–100 here, so a candidate could read 85 in
 * the applicant list and 60 in this panel. It now writes the prose only, and a
 * model failure still returns the ranking with deterministic notes.
 */

/** Recommendation bands on the ATS score, for candidates who meet the requirements. */
const SHORTLIST_AT = 70;
const CONSIDER_AT = 50;
/** Applications scored inline before ranking, so a fresh job is not ranked on nulls. */
const MAX_INLINE_SCORING = 40;

type Recommendation = "shortlist" | "consider" | "pass";

interface RankedApplication {
  _id: unknown;
  jobSeekerId: unknown;
  aiMatchScore?: number;
  requirementsStatus?: string;
  qualifications?: IQualificationCheck[];
  matchedSkills?: string[];
  missingSkills?: string[];
}

function recommend(app: RankedApplication): Recommendation {
  if (app.requirementsStatus === "not_met") return "pass";
  const score = app.aiMatchScore ?? 0;
  return score >= SHORTLIST_AT ? "shortlist" : score >= CONSIDER_AT ? "consider" : "pass";
}

function failedRequirements(app: RankedApplication): string[] {
  return (app.qualifications ?? [])
    .filter((check) => check.hard && check.status === "not_met")
    .map((check) => `${check.label ?? check.key}: asks ${check.required ?? "?"}, has ${check.actual ?? "not stated"}`);
}

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
    const { allowed, remaining, resetAt } = await checkRateLimit(
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
      .select("title requirements employerId")
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

    // Candidates still in play. Withdrawn and rejected ones are not screened.
    const open = { jobId, status: { $nin: ["withdrawn", "rejected"] } };

    // Score what has never been scored, so the ranking below never sorts a
    // fresh applicant to the bottom for want of a number.
    const unscored = await Application.find({ ...open, scoredAt: null })
      .sort({ appliedAt: 1 })
      .limit(MAX_INLINE_SCORING)
      .select("_id")
      .lean();
    if (unscored.length > 0) {
      const scored = await scoreApplicationsOfJob(jobId, unscored.map((a) => String(a._id)));
      if (scored.length > 0) {
        await Application.bulkWrite(
          scored.map(({ applicationId, match }) => ({
            updateOne: { filter: { _id: applicationId }, update: { $set: applicantMatchUpdate(match) } },
          })),
        );
      }
    }

    // Candidates who meet the requirements first, best score first; only then
    // the ones who fail one, so a padded list never hides a qualified person.
    const fields = "jobSeekerId aiMatchScore requirementsStatus qualifications matchedSkills missingSkills";
    const sort = { aiMatchScore: -1 as const, appliedAt: 1 as const, _id: 1 as const };
    const qualified = (await Application.find({ ...open, requirementsStatus: { $ne: "not_met" } })
      .sort(sort)
      .limit(maxCandidates)
      .select(fields)
      .lean()) as RankedApplication[];
    const failing = qualified.length < maxCandidates
      ? ((await Application.find({ ...open, requirementsStatus: "not_met" })
          .sort(sort)
          .limit(maxCandidates - qualified.length)
          .select(fields)
          .lean()) as RankedApplication[])
      : [];
    const applications = [...qualified, ...failing];

    if (!applications.length) {
      return NextResponse.json({ candidates: [], message: "No applications found" });
    }

    const seekers = await JobSeeker.find({ _id: { $in: applications.map((a) => a.jobSeekerId) } })
      .select("fullName userId totalExperienceYears experience education")
      .populate("userId", "name")
      .lean();
    const seekerById = new Map(
      (seekers as Array<{ _id: unknown; fullName?: string; userId?: { name?: string } }>).map((s) => [String(s._id), s]),
    );

    const ranked = applications.map((app) => {
      const seeker = seekerById.get(String(app.jobSeekerId));
      const name = seeker?.fullName?.trim() || seeker?.userId?.name?.trim() || "Unknown";
      return { app, id: String(app.jobSeekerId), name, recommendation: recommend(app) };
    });

    // The model sees the established facts and writes prose around them.
    const facts = ranked.map(({ app, id, recommendation }) => ({
      id,
      score: app.aiMatchScore ?? 0,
      recommendation,
      skillsMatched: sanitizeAiList(app.matchedSkills, 10, 60),
      skillsMissing: sanitizeAiList(app.missingSkills, 10, 60),
      requirementsNotMet: failedRequirements(app).map((line) => sanitizeAIInput(line, 160)),
    }));

    const prompt = `You are a recruitment screening expert writing notes for a hiring manager.

JOB: ${sanitizeAIInput(String((job as { title?: string }).title ?? "Unknown"), 120)}

Each candidate below has ALREADY been scored and given a recommendation. Do not change or restate the score. For each one write:
- strengths: up to 3 short strings, consistent with skillsMatched
- gaps: up to 2 short strings, consistent with skillsMissing and requirementsNotMet
- summary: one sentence explaining the recommendation

CANDIDATES:
${JSON.stringify(facts, null, 2)}

Output ONLY a JSON array of {"id","strengths","gaps","summary"}, no markdown code blocks.`;

    const notes = new Map<string, { strengths: string[]; gaps: string[]; summary: string }>();
    try {
      const rawText = (await generateText(prompt, GEMINI_MODELS.flash, 3000)).trim();
      const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const parsed = JSON.parse(cleaned) as Array<{ id?: unknown; strengths?: unknown; gaps?: unknown; summary?: unknown }>;
      for (const row of Array.isArray(parsed) ? parsed : []) {
        if (typeof row?.id !== "string") continue;
        notes.set(row.id, {
          strengths: Array.isArray(row.strengths) ? row.strengths.map(String).filter(Boolean).slice(0, 3) : [],
          gaps: Array.isArray(row.gaps) ? row.gaps.map(String).filter(Boolean).slice(0, 2) : [],
          summary: typeof row.summary === "string" ? row.summary : "",
        });
      }
    } catch (err) {
      // The ranking stands without the prose; fall back to the facts below.
      logger.warn({ err, jobId }, "[Screen Candidates] narrative unavailable; returning deterministic notes");
    }

    const candidates = ranked.map(({ app, id, name, recommendation }) => {
      const note = notes.get(id);
      const failed = failedRequirements(app);
      return {
        id,
        applicationId: String(app._id),
        name: sanitizeAIInput(name, 120),
        score: app.aiMatchScore ?? 0,
        recommendation,
        requirementsStatus: app.requirementsStatus ?? null,
        strengths: note?.strengths.length ? note.strengths : (app.matchedSkills ?? []).slice(0, 3),
        gaps: note?.gaps.length ? note.gaps : [...failed, ...(app.missingSkills ?? [])].slice(0, 2),
        summary: note?.summary ?? "",
      };
    });

    await logActivity({
      actorId: userId,
      actorRole: userRole,
      action: "ai.candidate_screening",
      resource: "applications",
      resourceId: jobId,
      meta: { totalReviewed: candidates.length },
      req,
    });

    return NextResponse.json(
      {
        candidates,
        jobTitle: (job as { title?: string }).title,
        totalReviewed: candidates.length,
      },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (err) {
    if (err instanceof NextResponse) return err;
    logger.error({ err }, "[Screen Candidates Error]");
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
