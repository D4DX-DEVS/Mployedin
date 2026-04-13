import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
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

  let agentId: string | undefined;
  if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean() as { _id?: unknown } | null;
    if (agent?._id) agentId = String(agent._id);
  }

  for (const candidate of candidates) {
    try {
      if (!candidate.applicationId) {
        failed.push(candidate.jobSeekerId);
        continue;
      }

      const application = await Application.findById(candidate.applicationId)
        .select("jobId jobSeekerId employerId")
        .populate("jobId", "title")
        .lean() as {
          jobId?: { _id?: unknown; title?: string } | unknown;
          jobSeekerId?: unknown;
          employerId?: unknown;
        } | null;

      if (!application?.jobId || !application.jobSeekerId || !application.employerId) {
        failed.push(candidate.applicationId);
        continue;
      }

      const job = application.jobId as { _id?: unknown; title?: string };

      const interview = await Interview.create({
        applicationId: candidate.applicationId,
        jobSeekerId: application.jobSeekerId,
        employerId: application.employerId,
        agentId,
        jobId: job?._id ?? application.jobId,
        scheduledAt: new Date(scheduledAt),
        duration,
        type,
        location: location ?? null,
        meetLink: meetLink ?? null,
        status: "scheduled",
        reminderSent: false,
      });

      await Application.findByIdAndUpdate(candidate.applicationId, {
        $set: { status: "interview_scheduled" },
        $addToSet: { interviewIds: interview._id },
        $push: {
          statusHistory: {
            status: "interview_scheduled",
            changedAt: new Date(),
            changedBy: ctx.userId,
            note: "Interview scheduled",
          },
        },
      });

      const seeker = await JobSeeker.findById(application.jobSeekerId).select("userId").lean() as { userId?: unknown } | null;

      // Fire notification (non-blocking)
      if (seeker?.userId) {
        notifyInterviewScheduled(
          String(seeker.userId),
          job?.title ?? "Interview",
          new Date(scheduledAt),
          location ?? meetLink ?? "TBD",
          String(interview._id)
        ).catch(console.error);
      }

      created.push(String(interview._id));
    } catch (e) {
      console.error("Bulk interview create error:", candidate.applicationId ?? candidate.jobSeekerId, e);
      failed.push(candidate.applicationId ?? candidate.jobSeekerId);
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
