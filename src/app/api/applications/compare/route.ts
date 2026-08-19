import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Application from "@/models/Application";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");
  if (!idsParam) {
    return NextResponse.json({ error: "ids query param required" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 3); // max 3 candidates

  if (ids.length < 2) {
    return NextResponse.json({ error: "At least 2 application IDs required" }, { status: 400 });
  }

  // Validate ObjectId format
  const objectIdRe = /^[a-f\d]{24}$/i;
  if (ids.some((id) => !objectIdRe.test(id))) {
    return NextResponse.json({ error: "Invalid application ID" }, { status: 400 });
  }

  // Employer ownership check
  let empId: string | null = null;
  if (ctx.role === "employer") {
    const emp = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!emp) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    empId = String(emp._id);
  } else if (["agent", "super_agent"].includes(ctx.role)) {
    const Agent = (await import("@/models/Agent")).default;
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    // For agents, verify all applications belong to their assigned employers or jobs they own
    // Store agent scope for later validation
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const applications = await Application.find({ _id: { $in: ids } })
    .populate("jobSeekerId", "name profilePicture skills experience preferredSalary profileCompleteness")
    .populate("jobId", "title salaryRange agentId")
    .lean();

  // Ownership guard: all applications must belong to this employer/agent
  if (empId) {
    const foreign = applications.find((a) => String(a.employerId) !== empId);
    if (foreign) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (["agent", "super_agent"].includes(ctx.role)) {
    const Agent = (await import("@/models/Agent")).default;
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id assignedEmployerIds").lean();
    if (!agent) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    for (const app of applications) {
      const job = app.jobId as unknown as { agentId?: unknown; employerId?: unknown } | null;
      if (!job) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      const hasAccess = String(job.agentId) === String(agent._id) ||
        (agent.assignedEmployerIds ?? []).some((id: unknown) => String(id) === String(app.employerId));
      if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Compute years of experience from populated jobSeekerId
  const candidates = applications.map((app) => {
    const seeker = app.jobSeekerId as unknown as {
      name?: string;
      profilePicture?: string;
      skills?: string[];
      experience?: { startDate?: Date; endDate?: Date }[];
      preferredSalary?: { min: number; max: number; currency: string };
      profileCompleteness?: number;
    } | null;

    const job = app.jobId as unknown as {
      title?: string;
      salaryRange?: { min: number; max: number; currency: string };
    } | null;

    // Calculate total years of experience
    let yearsOfExperience = 0;
    if (seeker?.experience?.length) {
      for (const exp of seeker.experience) {
        const start = exp.startDate ? new Date(exp.startDate).getTime() : null;
        const end = exp.endDate ? new Date(exp.endDate).getTime() : Date.now();
        if (start) {
          yearsOfExperience += (end - start) / (1000 * 60 * 60 * 24 * 365);
        }
      }
    }

    return {
      applicationId: String(app._id),
      status: app.status,
      appliedAt: app.appliedAt,
      aiMatchScore: app.aiMatchScore ?? null,
      matchBreakdown: app.matchBreakdown ?? null,
      candidate: {
        name: seeker?.name ?? "Unknown",
        profilePicture: seeker?.profilePicture ?? null,
        skills: seeker?.skills ?? [],
        yearsOfExperience: Math.round(yearsOfExperience * 10) / 10,
        preferredSalary: seeker?.preferredSalary ?? null,
        profileCompleteness: seeker?.profileCompleteness ?? 0,
      },
      job: {
        title: job?.title ?? "",
        salaryRange: job?.salaryRange ?? null,
      },
    };
  });

  // Compute skill overlap across candidates
  const allSkillSets = candidates.map((c) => new Set(c.candidate.skills.map((s) => s.toLowerCase())));
  const commonSkills =
    allSkillSets.length > 0
      ? [...allSkillSets[0]].filter((skill) => allSkillSets.every((set) => set.has(skill)))
      : [];

  return NextResponse.json({ candidates, commonSkills });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
