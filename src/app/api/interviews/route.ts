import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import { validateBody } from "@/lib/validators";
import { interviewCreateSchema } from "@/lib/validators/interviews";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyInterviewScheduled } from "@/lib/notifications/trigger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(_req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10)));
  const status = searchParams.get("status") ?? "";
  const applicationId = searchParams.get("applicationId") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: Record<string, any> = {};

  if (ctx.role === "job_seeker") {
    const seeker = await JobSeeker.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!seeker) return NextResponse.json({ interviews: [] });
    query.jobSeekerId = seeker._id;
  } else if (ctx.role === "employer") {
    const { Employer } = await import("@/models/Employer");
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ interviews: [] });
    query.employerId = emp._id;
  } else if (ctx.role === "agent") {
    const { Agent } = await import("@/models/Agent");
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ interviews: [] });
    query.employerId = { $in: agent.assignedEmployerIds };
  } else if (ctx.role === "super_agent") {
    // Super agents see interviews for employers assigned to their agents
    const { Agent } = await import("@/models/Agent");
    const agents = await Agent.find({ supervisorId: ctx.userId }).select("assignedEmployerIds").lean();
    const allEmployerIds = agents.flatMap((a) => a.assignedEmployerIds ?? []);
    if (allEmployerIds.length > 0) {
      query.employerId = { $in: allEmployerIds };
    }
  }
  // admin: query stays {} — sees all

  if (status) query.status = status;
  if (applicationId) query.applicationId = applicationId;

  const skip = (page - 1) * limit;

  const [interviews, total] = await Promise.all([
    Interview.find(query)
      .sort({ scheduledAt: 1 })
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
  ]);

  const enriched = interviews.map((iv) => {
    const job = iv.jobId as unknown as {
      _id?: unknown;
      title?: string;
      requirements?: { skills?: string[]; experienceMin?: number };
    } | null;
    const employer = iv.employerId as unknown as { companyName?: string } | null;
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

  return NextResponse.json({ interviews: enriched, total, page, limit });
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

  const job = app.jobId as unknown as { _id?: unknown; title?: string };

  const interview = await Interview.create({
    applicationId,
    jobId: job?._id ?? app.jobId,
    jobSeekerId: app.jobSeekerId,
    employerId: app.employerId ?? body.employerId,
    agentId: body.agentId,
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

  const seeker = await JobSeeker.findById(app.jobSeekerId).select("userId").lean() as { userId?: unknown } | null;
  if (seeker?.userId) {
    await notifyInterviewScheduled(
      String(seeker.userId),
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
