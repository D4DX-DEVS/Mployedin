import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
// Ensure Mongoose model registration for populate
void Job;
import { validateBody } from "@/lib/validators";
import { interviewCreateSchema } from "@/lib/validators/interviews";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";
import { addMinutes } from "date-fns";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(_req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));
  const status = searchParams.get("status") ?? "";
  const applicationId = searchParams.get("applicationId") ?? "";
  const employerIdParam = searchParams.get("employerId") ?? "";
  const jobIdParam = searchParams.get("jobId") ?? "";
  const typeParam = searchParams.get("type") ?? "";
  const outcomeParam = searchParams.get("outcome") ?? "";
  const search = searchParams.get("search") ?? "";
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";
  const sortBy = searchParams.get("sortBy") ?? "scheduledAt";
  const sortOrder = searchParams.get("sortOrder") === "desc" ? -1 : 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: Record<string, any> = {};
  // Track role-level employer scope for sub-filtering
  let scopedEmployerIds: unknown[] | null = null;

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ interviews: [], total: 0, statusCounts: {} });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ interviews: [], total: 0, statusCounts: {} });
    query.employerId = emp._id;
  } else if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ interviews: [], total: 0, statusCounts: {} });
    scopedEmployerIds = agent.assignedEmployerIds ?? [];
    // Match interviews for assigned employers OR directly linked to this agent
    query.$or = [
      { employerId: { $in: scopedEmployerIds } },
      { agentId: agent._id },
    ];
  } else if (ctx.role === "super_agent") {
    const { Agent } = await import("@/models/Agent");
    const agents = await Agent.find({ superAgentId: ctx.userId }).select("_id assignedEmployerIds").lean();
    const allEmployerIds = agents.flatMap((a) => a.assignedEmployerIds ?? []);
    const allAgentIds = agents.map((a) => a._id);
    if (allEmployerIds.length > 0 || allAgentIds.length > 0) {
      scopedEmployerIds = allEmployerIds;
      query.$or = [
        ...(allEmployerIds.length > 0 ? [{ employerId: { $in: allEmployerIds } }] : []),
        ...(allAgentIds.length > 0 ? [{ agentId: { $in: allAgentIds } }] : []),
      ];
    }
  }
  // admin: query stays {} — sees all

  if (status) query.status = status;
  if (applicationId) query.applicationId = applicationId;

  // Employer sub-filter (must be within scope)
  if (employerIdParam) {
    const { isValidObjectId } = await import("@/lib/security/sanitize");
    if (isValidObjectId(employerIdParam)) {
      // If agent/super_agent has $or scope, replace it with a scoped employer+agentId filter
      if (query.$or) {
        delete query.$or;
        query.employerId = employerIdParam;
      } else {
        query.employerId = employerIdParam;
      }
    }
  }

  // Job filter
  if (jobIdParam) {
    const { isValidObjectId } = await import("@/lib/security/sanitize");
    if (isValidObjectId(jobIdParam)) {
      query.jobId = jobIdParam;
    }
  }

  // Type filter
  if (typeParam && ["video", "offline", "hybrid"].includes(typeParam)) {
    query.type = typeParam;
  }

  // Outcome filter
  if (outcomeParam && ["passed", "failed", "hold", "no_show"].includes(outcomeParam)) {
    query.outcome = outcomeParam;
  }

  // Date range filter
  if (dateFrom || dateTo) {
    query.scheduledAt = {};
    if (dateFrom) query.scheduledAt.$gte = new Date(dateFrom);
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      query.scheduledAt.$lte = end;
    }
  }

  // Text search on candidate name (requires lookup)
  let seekerIdFilter: unknown[] | null = null;
  if (search) {
    const User = (await import("@/models/User")).default;
    const matchingUsers = await User.find({
      name: { $regex: search, $options: "i" },
    }).select("_id").lean();
    const userIds = matchingUsers.map((u) => u._id);
    if (userIds.length > 0) {
      const matchingSeekers = await JobSeeker.find({ userId: { $in: userIds } }).select("_id").lean();
      seekerIdFilter = matchingSeekers.map((s) => s._id);
    }
    // Also search job titles
    const matchingJobs = await Job.find({
      title: { $regex: search, $options: "i" },
    }).select("_id").lean();
    const jobIds = matchingJobs.map((j) => j._id);

    if (seekerIdFilter && jobIds.length > 0) {
      query.$or = [
        { jobSeekerId: { $in: seekerIdFilter } },
        { jobId: { $in: jobIds } },
      ];
    } else if (seekerIdFilter) {
      query.jobSeekerId = { $in: seekerIdFilter };
    } else if (jobIds.length > 0) {
      query.jobId = { $in: jobIds };
    } else {
      // No matches found for search
      return NextResponse.json({ interviews: [], total: 0, page, limit, statusCounts: { scheduled: 0, confirmed: 0, completed: 0, cancelled: 0, rescheduled: 0 } });
    }
  }

  const skip = (page - 1) * limit;
  const sortObj: Record<string, 1 | -1> = { [sortBy]: sortOrder as 1 | -1 };

  // Build base query without status for aggregate counts
  const baseQuery = { ...query };
  delete baseQuery.status;

  const [interviews, total, statusAgg] = await Promise.all([
    Interview.find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title requirements")
      .populate("employerId", "companyName")
      .populate({
        path: "jobSeekerId",
        select: "userId skills experience",
        populate: { path: "userId", select: "name email" },
      })
      .lean(),
    Interview.countDocuments(query),
    Interview.aggregate([
      { $match: baseQuery },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const s of statusAgg) {
    statusCounts[s._id] = s.count;
  }

  const enriched = interviews.map((iv) => {
    const job = iv.jobId as unknown as {
      _id?: unknown;
      title?: string;
      requirements?: { skills?: string[]; experienceMin?: number };
    } | null;
    const employer = iv.employerId as unknown as { _id?: unknown; companyName?: string } | null;
    const seeker = iv.jobSeekerId as unknown as {
      _id?: unknown;
      skills?: string[];
      experience?: { jobTitle: string; company: string; isCurrent: boolean; startDate?: string }[];
      userId?: { name?: string; email?: string };
    } | null;

    return {
      ...iv,
      jobTitle: job?.title,
      companyName: employer?.companyName,
      jobId: job
        ? {
            _id: job._id,
            title: job.title,
            requirements: job.requirements,
          }
        : undefined,
      employerId: employer
        ? {
            _id: employer._id,
            companyName: employer.companyName,
          }
        : undefined,
      jobSeekerId: seeker
        ? {
            _id: seeker._id,
            fullName: seeker.userId?.name,
            email: seeker.userId?.email,
            skills: seeker.skills,
            experience: seeker.experience,
          }
        : undefined,
    };
  });

  return NextResponse.json({ interviews: enriched, total, page, limit, statusCounts });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();
  const body = await validateBody(req, interviewCreateSchema);
  const { applicationId, type, scheduledAt, duration, location, meetLink, instructions } = body;

  const app = await Application.findById(applicationId)
    .select("jobId jobSeekerId employerId")
    .populate("jobId", "title")
    .lean();
  if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  // ── Check candidate availability ─────────────────────────────────────────
  const seekerDoc = await JobSeeker.findById(app.jobSeekerId)
    .select("settings userId")
    .lean() as { settings?: { instantBooking?: boolean; weeklyAvailability?: string[]; availableHours?: { day: string; startTime: string; endTime: string }[]; timeBuffer?: number; timezone?: string }; userId?: unknown } | null;

  if (seekerDoc?.settings?.instantBooking) {
    const reqDate = new Date(scheduledAt);
    const tz = seekerDoc.settings.timezone ?? "Asia/Dubai";

    // Convert the requested UTC time to the seeker's local timezone
    const localDayName = (() => {
      const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayIndex = new Date(reqDate.toLocaleString("en-US", { timeZone: tz })).getDay();
      return DAY_NAMES[dayIndex];
    })();

    const localHhmm = reqDate.toLocaleString("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const weeklyAvail = seekerDoc.settings.weeklyAvailability ?? ["Mon", "Tue", "Wed", "Thu", "Fri"];

    if (!weeklyAvail.includes(localDayName)) {
      return NextResponse.json(
        { error: `Candidate is not available on ${localDayName}s (${tz})` },
        { status: 409 },
      );
    }

    const availableHours = seekerDoc.settings.availableHours ?? [];
    const dayHours = availableHours.find((h) => h.day === localDayName);
    if (dayHours) {
      const interviewDuration = duration ?? 30;
      const endDate = addMinutes(reqDate, interviewDuration);
      const endLocalHhmm = endDate.toLocaleString("en-GB", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });

      if (localHhmm < dayHours.startTime || endLocalHhmm > dayHours.endTime) {
        return NextResponse.json(
          { error: `Candidate is available ${dayHours.startTime}–${dayHours.endTime} ${tz} on ${localDayName}. Requested time ${localHhmm}–${endLocalHhmm} is outside that window.` },
          { status: 409 },
        );
      }
    }

    // Check for conflicting interviews (including buffer)
    const timeBuffer = seekerDoc.settings.timeBuffer ?? 30;
    const interviewDuration = duration ?? 30;
    const windowStart = addMinutes(reqDate, -timeBuffer);
    const windowEnd = addMinutes(reqDate, interviewDuration + timeBuffer);

    const conflict = await Interview.findOne({
      jobSeekerId: app.jobSeekerId,
      status: { $in: ["scheduled", "confirmed"] },
      scheduledAt: { $gte: windowStart, $lt: windowEnd },
    }).lean();

    if (conflict) {
      return NextResponse.json(
        { error: "Time slot conflicts with an existing interview (including buffer time)." },
        { status: 409 },
      );
    }
  }

  const job = app.jobId as unknown as { _id?: unknown; title?: string };

  // Auto-resolve agentId from employer if not provided
  let resolvedAgentId = body.agentId;
  if (!resolvedAgentId) {
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findById(app.employerId).select("agentId").lean();
    if (emp?.agentId) resolvedAgentId = String(emp.agentId);
  }

  const interview = await Interview.create({
    applicationId,
    jobId: job?._id ?? app.jobId,
    jobSeekerId: app.jobSeekerId,
    employerId: app.employerId ?? body.employerId,
    agentId: resolvedAgentId,
    type,
    scheduledAt: new Date(scheduledAt),
    duration: duration ?? 30,
    location,
    meetLink,
    instructions,
    status: "scheduled",
    reminderSent: false,
    rescheduleCount: 0,
  });

  // Increment agent performance counter
  if (resolvedAgentId) {
    const { incrementAgentCounter } = await import("@/lib/agentPerformance");
    incrementAgentCounter(String(resolvedAgentId), "interviewsScheduled");
  }

  await Application.findByIdAndUpdate(applicationId, {
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

  if (seekerDoc?.userId) {
    await notifyInterviewScheduled(
      String(seekerDoc.userId),
      job?.title ?? "Interview",
      new Date(scheduledAt),
      location ?? meetLink ?? "TBD",
      String(interview._id)
    ).catch(() => {});
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.create",
    resource: "interviews",
    resourceId: String(interview._id),
    meta: { applicationId, type, scheduledAt },
    req,
  });

  return NextResponse.json({ interview }, { status: 201 });
}

export const GET = withAuth(handler, { resource: "interviews", action: "read" });
export const POST = withAuth(postHandler, { resource: "interviews", action: "create" });
