import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface BulkCandidate {
  jobSeekerId: string;
  applicationId?: string;
}

/**
 * POST /api/interviews/bulk
 * Schedule interviews for multiple candidates simultaneously.
 * Body: { candidates, scheduledAt, duration, type, location?, meetLink?, jobId? }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();

  const body = await req.json();
  const {
    candidates,
    scheduledAt,
    duration = 45,
    type = "video",
    location,
    meetLink,
    jobId,
  } = body as {
    candidates: BulkCandidate[];
    scheduledAt: string;
    duration?: number;
    type?: string;
    location?: string;
    meetLink?: string;
    jobId?: string;
  };

  if (!candidates?.length || !scheduledAt) {
    return NextResponse.json({ message: "candidates and scheduledAt required." }, { status: 400 });
  }

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
