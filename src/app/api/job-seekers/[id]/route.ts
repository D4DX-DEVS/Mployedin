import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobSeekerAdminUpdateSchema } from "@/lib/validators/job-seekers";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id).populate("userId", "name email").lean();
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });
  return NextResponse.json({ jobSeeker: seeker });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id);
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });

  const body = await validateBody(req, jobSeekerAdminUpdateSchema) as Record<string, unknown>;
  const allowed = ["nationality", "currentLocation", "summary", "skills", "experience", "education", "languages"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

  // Allow updating the linked User's name/email
  if (body.name || body.email) {
    const userUpdate: Record<string, unknown> = {};
    if (body.name) userUpdate.name = body.name;
    if (body.email) userUpdate.email = body.email;
    await User.findByIdAndUpdate(seeker.userId, userUpdate);
  }

  Object.assign(seeker, update);
  await seeker.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.update",
    resource: "job_seekers",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ jobSeeker: seeker });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id);
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });

  // Soft-delete: deactivate linked user
  await User.findByIdAndUpdate(seeker.userId, { isActive: false });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.deactivate",
    resource: "job_seekers",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Job seeker deactivated" });
}

export const GET = withAuth(getHandler, { resource: "job_seekers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "job_seekers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "job_seekers", action: "delete" });
