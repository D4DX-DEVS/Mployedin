import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { interviewBulkSchema } from "@/lib/validators/interviews";
import { checkRateLimitDual, RATE_LIMIT_CONFIGS } from "@/lib/security/rateLimit";

/**
 * POST /api/interviews/bulk
 * Schedule interviews for multiple candidates simultaneously.
 * Body: { candidates, scheduledAt, duration, type, location?, meetLink?, jobId? }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  const rl = checkRateLimitDual(req, ctx.userId, RATE_LIMIT_CONFIGS.bulk);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const body = await validateBody(req, interviewBulkSchema);

  await connectDB();

  const {
    candidates,
    scheduledAt,
    duration = 45,
    type = "video",
    location,
    meetLink,
    jobId,
  } = body;

  const created: string[] = [];
  const failed: string[] = [];

  for (const candidate of candidates) {
    try {
      const interview = await Interview.create({
        jobSeekerId: candidate.jobSeekerId,
        employerId: ctx.userId,
        jobId: jobId ?? null,
        scheduledAt: new Date(scheduledAt),
        duration,
        type,
        location: location ?? null,
        meetLink: meetLink ?? null,
        status: "scheduled",
        reminderSent: false,
      });

      // Fire notification (non-blocking)
      notifyInterviewScheduled(
        candidate.jobSeekerId,
        "your interview",
        new Date(scheduledAt),
        location ?? meetLink ?? "TBD",
        String(interview._id)
      ).catch(console.error);

      created.push(String(interview._id));
    } catch (e) {
      console.error("Bulk interview create error:", candidate.jobSeekerId, e);
      failed.push(candidate.jobSeekerId);
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.bulk_create",
    resource: "interviews",
    meta: { created: created.length, failed: failed.length, jobId },
    req,
  });

  return NextResponse.json({ created: created.length, failed: failed.length, ids: created });
}, { resource: "interviews", action: "create" });
