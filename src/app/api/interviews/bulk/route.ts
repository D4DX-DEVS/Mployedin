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
 * Schedule interviews for multiple candidates with auto-staggered time slots.
 *
 * Body: {
 *   candidates, scheduledAt (first slot start), duration, type,
 *   location?, meetLink?, jobId?,
 *   durationPerCandidate? (minutes per slot – defaults to `duration`),
 *   gapMinutes? (break between slots – defaults to 0),
 *   workingHours? { start: "HH:mm", end: "HH:mm" },
 *   breaks? [{ label, start: "HH:mm", end: "HH:mm" }]
 * }
 *
 * Scheduling algorithm:
 *   - Slots are placed sequentially starting at `scheduledAt`
 *   - Each slot respects working hours (won't schedule outside the window)
 *   - Slots skip named break windows (e.g. lunch, tea)
 *   - If a day fills up, remaining interviews spill to the next day
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
    durationPerCandidate,
    gapMinutes = 0,
    workingHours,
    breaks: breakWindows,
  } = body;

  const slotDuration = durationPerCandidate ?? duration;
  const baseTime = new Date(scheduledAt);

  // ---- Working-hours-aware slot scheduler ----
  const parseHM = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
  const whStartMin = workingHours ? parseHM(workingHours.start) : 0;
  const whEndMin = workingHours ? parseHM(workingHours.end) : 24 * 60;
  const sortedBreaks = (breakWindows ?? [])
    .filter((b) => b.start && b.end && parseHM(b.start) < parseHM(b.end))
    .sort((a, b) => parseHM(a.start) - parseHM(b.start));

  const setTimeOnDate = (d: Date, hm: string) => {
    const [h, m] = hm.split(":").map(Number);
    const n = new Date(d);
    n.setHours(h, m, 0, 0);
    return n;
  };
  const minuteOfDay = (d: Date) => d.getHours() * 60 + d.getMinutes();

  function nextAvailableSlot(cursor: Date, durationMin: number): Date {
    let c = new Date(cursor);
    for (let iter = 0; iter < 50; iter++) {
      const cMin = minuteOfDay(c);
      const slotEndMin = cMin + durationMin;

      // Before working hours → advance to WH start
      if (workingHours && cMin < whStartMin) {
        c = setTimeOnDate(c, workingHours.start);
        continue;
      }
      // Past working hours → next day WH start
      if (workingHours && slotEndMin > whEndMin) {
        const next = new Date(c);
        next.setDate(next.getDate() + 1);
        c = setTimeOnDate(next, workingHours.start);
        continue;
      }
      // Check break overlaps
      let pushed = false;
      for (const brk of sortedBreaks) {
        const bStart = parseHM(brk.start);
        const bEnd = parseHM(brk.end);
        if (cMin < bEnd && slotEndMin > bStart) {
          c = setTimeOnDate(c, brk.end);
          pushed = true;
          break;
        }
      }
      if (pushed) continue;
      return c;
    }
    return c;
  }

  const created: string[] = [];
  const failed: string[] = [];
  const schedule: { applicationId: string; scheduledAt: string }[] = [];

  let agentId: string | undefined;
  if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean() as { _id?: unknown } | null;
    if (agent?._id) agentId = String(agent._id);
  }
  // Auto-resolve agentId from employer when called by non-agent roles
  if (!agentId && candidates.length > 0 && candidates[0].applicationId) {
    const firstApp = await Application.findById(candidates[0].applicationId).select("employerId").lean();
    if (firstApp?.employerId) {
      const { Employer } = await import("@/models/Employer");
      const emp = await Employer.findById(firstApp.employerId).select("agentId").lean();
      if (emp?.agentId) agentId = String(emp.agentId);
    }
  }

  let slotCursor = new Date(baseTime);

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

      // Auto-calculate next available time slot (respects working hours + breaks)
      const candidateTime = nextAvailableSlot(slotCursor, slotDuration);

      const interview = await Interview.create({
        applicationId: candidate.applicationId,
        jobSeekerId: application.jobSeekerId,
        employerId: application.employerId,
        agentId,
        jobId: job?._id ?? application.jobId,
        scheduledAt: candidateTime,
        duration: slotDuration,
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
            note: `Interview scheduled at ${candidateTime.toISOString()}`,
          },
        },
      });

      const seeker = await JobSeeker.findById(application.jobSeekerId).select("userId").lean() as { userId?: unknown } | null;

      // Fire notification (non-blocking)
      if (seeker?.userId) {
        notifyInterviewScheduled(
          String(seeker.userId),
          job?.title ?? "Interview",
          candidateTime,
          location ?? meetLink ?? "TBD",
          String(interview._id)
        ).catch(console.error);
      }

      created.push(String(interview._id));
      schedule.push({
        applicationId: candidate.applicationId,
        scheduledAt: candidateTime.toISOString(),
      });
      // Advance cursor past this slot + gap
      slotCursor = new Date(candidateTime.getTime() + (slotDuration + gapMinutes) * 60_000);
    } catch (e) {
      console.error("Bulk interview create error:", candidate.applicationId ?? candidate.jobSeekerId, e);
      failed.push(candidate.applicationId ?? candidate.jobSeekerId);
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.bulk_create",
    resource: "interviews",
    meta: { created: created.length, failed: failed.length, jobId, staggered: true },
    req,
  });

  return NextResponse.json({
    created: created.length,
    failed: failed.length,
    ids: created,
    schedule,
  });
}, { resource: "interviews", action: "create" });
