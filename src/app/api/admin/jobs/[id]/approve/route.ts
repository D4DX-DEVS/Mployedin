import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Job from "@/models/Job";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function handler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const job = await Job.findById(params?.id);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const { approved } = await req.json() as { approved: boolean };

  job.set("poster.approvalStatus", approved ? "approved" : "rejected");
  if (approved) job.status = "active";
  else job.status = "closed";

  await job.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: approved ? "job.approved" : "job.rejected",
    resource: "jobs",
    resourceId: String(job._id),
    meta: { title: job.title },
    req,
  });

  return NextResponse.json({ job });
}

export const POST = withAuth(handler, { resource: "jobs", action: "update" });
