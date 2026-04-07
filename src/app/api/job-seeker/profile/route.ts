import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const profile = await JobSeeker.findOne({ userId: ctx.userId }).lean();

  if (!profile) {
    return NextResponse.json(null, { status: 204 });
  }

  return NextResponse.json(profile);
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, jobSeekerProfileUpdateSchema);

  // Strip protected fields
  const { userId: _u, _id: _i, createdAt: _c, updatedAt: _up, ...safeUpdate } = body;
  void _u; void _i; void _c; void _up;

  const profile = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: safeUpdate },
    { upsert: true, new: true, runValidators: true }
  );

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.update_profile",
    resource: "job_seekers",
    resourceId: ctx.userId,
    req,
  });

  return NextResponse.json(profile);
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
