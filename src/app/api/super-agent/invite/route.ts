import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import { canSourceForJob } from "@/lib/jobs/sourcingAccess";
import { inviteToApply } from "@/lib/jobs/inviteToApply";

/**
 * POST /api/super-agent/invite
 *
 * A super agent invites a matched candidate to apply to a job in their book
 * (client rollout 2026-10-27: super agents need to match candidates to jobs
 * and contact them). Body as /api/employer/talent-search/invite.
 *
 * A separate route rather than a wider permission: super-agents hold no
 * applications:update, and granting it would open every application write.
 * This route does exactly one thing, and the territory is enforced here on the
 * server: the job must be in the super agent's book (canSourceForJob). Consent,
 * duplicate and rate rules are the shared ones in lib/jobs/inviteToApply.
 */
async function handler(req: NextRequest, ctx: { userId: string; role: string; locale: string }) {
  if (ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  return inviteToApply(req, ctx, async (job) => {
    if (!(await canSourceForJob(ctx, job))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const emp = await Employer.findById(job.employerId).select("companyName").lean<{ companyName?: string } | null>();
    return { companyName: emp?.companyName };
  });
}

export const POST = withAuth(handler, { resource: "jobs", action: "read" });
