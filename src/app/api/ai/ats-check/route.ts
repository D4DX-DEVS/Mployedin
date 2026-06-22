import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import JobSeeker from "@/models/JobSeeker";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import { validateBody } from "@/lib/validators";
import { aiAtsCheckSchema } from "@/lib/validators/ai";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { downloadBuffer } from "@/lib/storage/spaces";
import {
  analyzeResumeText,
  extractResumeText,
  computeKeywordCoverage,
  type AtsReport,
} from "@/lib/ats/analyzeCv";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Best-effort MIME guess from the stored CV file extension. */
function guessMime(url: string): string {
  const clean = url.split("?")[0].toLowerCase();
  if (clean.endsWith(".pdf")) return "application/pdf";
  if (clean.endsWith(".docx")) return DOCX_MIME;
  if (clean.endsWith(".doc")) return "application/msword";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "image/jpeg";
  if (clean.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

interface SeekerCv {
  originalUrl?: string;
  rawText?: string;
  atsReport?: AtsReport;
}
interface SeekerDoc {
  _id: unknown;
  cv?: SeekerCv;
  documents?: Array<{ category?: string; url?: string }>;
}

/**
 * POST /api/ai/ats-check
 * Body: { jobSeekerId?: string, jobId?: string, force?: boolean }
 *
 * Runs a deterministic ATS-friendliness analysis on a candidate's CV:
 * downloads the stored file, extracts its text layer (exactly like an ATS
 * does), and scores parseability, structure and contact data. When `jobId`
 * is supplied, also reports keyword coverage against the job's required skills.
 *
 * Employers / agents / admins analyze a candidate by `jobSeekerId`; job seekers
 * analyze their own CV. Results are cached on the JobSeeker to avoid re-parsing.
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.ai);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  const { jobSeekerId, jobId, force } = await validateBody(req, aiAtsCheckSchema);

  await connectDB();

  // ── Resolve the target job seeker + access control ──────────────────────────
  let seeker: SeekerDoc | null = null;

  if (ctx.role === "job_seeker") {
    seeker = (await JobSeeker.findOne({ userId: ctx.userId })
      .select("cv documents")
      .lean()) as SeekerDoc | null;
  } else if (ctx.role === "employer" || ctx.role === "agent" || ctx.role === "admin") {
    if (!jobSeekerId) {
      return NextResponse.json({ error: "jobSeekerId is required" }, { status: 400 });
    }
    seeker = (await JobSeeker.findById(jobSeekerId)
      .select("cv documents")
      .lean()) as SeekerDoc | null;
  } else {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!seeker) {
    return NextResponse.json({ error: "Candidate profile not found" }, { status: 404 });
  }

  // ── Locate a CV file ────────────────────────────────────────────────────────
  const resumeDoc = seeker.documents?.find((d) => d.category === "resume" && d.url);
  const cvUrl = seeker.cv?.originalUrl || resumeDoc?.url;
  if (!cvUrl) {
    return NextResponse.json(
      { error: "No CV on file for this candidate.", code: "NO_CV" },
      { status: 404 },
    );
  }

  // ── Resolve required keywords for optional job coverage ─────────────────────
  let requiredKeywords: string[] | undefined;
  if (jobId) {
    const job = (await Job.findById(jobId)
      .select("requirements.skills employerId agentId")
      .lean()) as { requirements?: { skills?: string[] }; employerId?: unknown; agentId?: unknown } | null;

    // Only attach coverage for jobs the caller is entitled to see.
    let allowed = ctx.role === "admin" || ctx.role === "job_seeker";
    if (!allowed && job && ctx.role === "employer") {
      const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
      allowed = !!employer && String(job.employerId) === String((employer as { _id: unknown })._id);
    }
    if (!allowed && job && ctx.role === "agent") {
      const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean() as
        { _id: unknown; assignedEmployerIds?: unknown[] } | null;
      allowed = !!agent && (
        String(job.agentId) === String(agent._id) ||
        (agent.assignedEmployerIds ?? []).some((id) => String(id) === String(job.employerId))
      );
    }
    if (allowed && job?.requirements?.skills?.length) {
      requiredKeywords = job.requirements.skills;
    }
  }

  // ── Analyze (use cache when possible) ───────────────────────────────────────
  let report = force ? null : (seeker.cv?.atsReport ?? null);
  let text = force ? null : (seeker.cv?.rawText ?? null);

  const needDownload = !report || (!!requiredKeywords && !text);

  if (needDownload) {
    let buffer: Buffer;
    try {
      buffer = await downloadBuffer(cvUrl);
    } catch {
      return NextResponse.json(
        { error: "Could not read the CV file from storage.", code: "DOWNLOAD_FAILED" },
        { status: 502 },
      );
    }

    const extract = await extractResumeText(buffer, guessMime(cvUrl));
    text = extract.text;
    report = analyzeResumeText(extract);

    // Cache the structural (job-agnostic) report + raw text for reuse.
    await JobSeeker.updateOne(
      { _id: seeker._id },
      {
        $set: {
          "cv.atsScore": report.atsScore,
          "cv.atsReport": report,
          "cv.rawText": (text ?? "").slice(0, 20000),
          "cv.atsAnalyzedAt": new Date(),
        },
      },
    );
  }

  // Attach job-specific keyword coverage without mutating the cached report.
  let result: AtsReport = report as AtsReport;
  if (requiredKeywords && text) {
    result = { ...result, keywordCoverage: computeKeywordCoverage(text, requiredKeywords) };
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "ai.ats_check",
    resource: "ai",
    resourceId: jobSeekerId ?? ctx.userId,
    meta: { atsScore: result.atsScore, rating: result.rating, jobId: jobId ?? null },
    req,
  });

  return NextResponse.json(result);
});
