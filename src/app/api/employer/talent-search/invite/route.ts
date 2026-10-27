import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { canSourceForJob } from "@/lib/jobs/sourcingAccess";
import { inviteToApply } from "@/lib/jobs/inviteToApply";

/**
 * POST /api/employer/talent-search/invite (FG-4)
 *
 * Invite a sourced candidate to apply to an open job — from the employer's
 * talent search and "Suitable profiles" tab, and from an agent's matching
 * list. The job must belong to the caller's employer — or, for an agent, to an
 * employer assigned to them (any job for admin). Super-agents hold no
 * applications:update, so withAuth refuses them here; they invite through
 * /api/super-agent/invite. The consent, duplicate and rate rules live in
 * lib/jobs/inviteToApply.
 */
async function handler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  await connectDB();

  return inviteToApply(req, ctx, async (job) => {
    if (ctx.role === "employer") {
      const emp = await Employer.findOne({ userId: ctx.userId }).select("_id companyName").lean<{ _id: unknown; companyName?: string } | null>();
      if (!emp) return NextResponse.json({ error: "Employer profile not found" }, { status: 404 });
      if (String(job.employerId) !== String(emp._id)) {
        return NextResponse.json({ error: "Forbidden: job not owned by employer" }, { status: 403 });
      }
      return { companyName: emp.companyName };
    }
    // Agents and admins invite on the job's employer's behalf.
    if (!(await canSourceForJob(ctx, job))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const emp = await Employer.findById(job.employerId).select("companyName").lean<{ companyName?: string } | null>();
    return { companyName: emp?.companyName };
  });
}

export const POST = withAuth(handler, { resource: "applications", action: "update" });
