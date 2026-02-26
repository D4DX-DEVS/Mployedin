import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

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
    // Super agents see interviews for employers in their territory
    const { Agent } = await import("@/models/Agent");
    const agents = await Agent.find({ supervisorId: ctx.userId }).select("assignedEmployerIds").lean();
    const allEmployerIds = agents.flatMap((a) => a.assignedEmployerIds ?? []);
    if (allEmployerIds.length > 0) {
      query.employerId = { $in: allEmployerIds };
    }
  }
  // admin: query stays {} — sees all

  const interviews = await Interview.find(query)
    .sort({ scheduledAt: 1 })
    .populate({
      path: "applicationId",
      populate: { path: "jobId", select: "title employerId" },
    })
    .lean();

  // Flatten job title and company into interview objects for frontend convenience
  const enriched = await Promise.all(
    interviews.map(async (iv) => {
      const app = iv.applicationId as unknown as {
        jobId?: { title?: string; employerId?: string };
      };
      return {
        ...iv,
        jobTitle: app?.jobId?.title,
        companyName: undefined, // populated separately if needed
      };
    })
  );

  return NextResponse.json({ interviews: enriched });
}

export const GET = withAuth(handler, { resource: "interviews", action: "read" });
