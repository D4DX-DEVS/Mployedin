import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { invitedSeekerIds } from "@/lib/jobs/jobInvites";
import { canSourceForJob } from "@/lib/jobs/sourcingAccess";
import { isValidObjectId } from "@/lib/security/sanitize";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";
import { matchTalentPoolForJob } from "@/lib/matching/talentPoolMatches";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 25, 50, 100].includes(n), "pageSize must be 10, 25, 50 or 100").default(10),
});

/**
 * GET /api/jobs/[id]/matching-candidates?page=1&pageSize=10
 *
 * The database's discoverable candidates (profileVisibility "visible") ranked
 * for this job, best first, with the reasons behind each score. Candidates who
 * already applied are left out — they are on the job's applicants list.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const jobId = params?.id;
  if (!isValidObjectId(jobId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query", details: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, { status: 400 });
  }
  const { page, pageSize } = parsed.data;

  const rl = await checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.api);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } },
    );
  }

  await connectDB();
  const job = await Job.findOne({ _id: jobId, deletedAt: null }).select("employerId agentId title status").lean();
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  if (!(await canSourceForJob(ctx, job))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [result, invited] = await Promise.all([matchTalentPoolForJob(String(jobId)), invitedSeekerIds(String(jobId))]);
  if (!result) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const total = result.candidates.length;
  const data = result.candidates
    .slice((page - 1) * pageSize, page * pageSize)
    .map((candidate) => ({ ...candidate, invited: invited.has(candidate.jobSeekerId) }));

  return NextResponse.json({
    data,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    poolSize: result.poolSize,
    alreadyApplied: result.alreadyApplied,
    scoredAt: result.scoredAt,
    job: { _id: String(job._id), title: job.title, status: job.status },
  });
}

export const GET = withAuth(getHandler, { resource: "jobs", action: "read" });
