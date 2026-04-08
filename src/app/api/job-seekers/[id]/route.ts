import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import ProfileView from "@/models/ProfileView";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobSeekerAdminUpdateSchema } from "@/lib/validators/job-seekers";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id).populate("userId", "name email").lean();
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });

  // Track profile view when employer/agent views a job seeker (deduplicate per 24h)
  const viewerRoles = ["employer", "agent", "super_agent"] as const;
  if (viewerRoles.includes(_ctx.role as typeof viewerRoles[number]) && _ctx.userId !== String(seeker.userId)) {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentView = await ProfileView.findOne({
      jobSeekerId: seeker.userId,
      viewerId: _ctx.userId,
      viewedAt: { $gte: oneDayAgo },
    }).lean();

    if (!recentView) {
      ProfileView.create({
        jobSeekerId: seeker.userId,
        viewerId: _ctx.userId,
        viewerRole: _ctx.role,
        source: "direct",
      }).catch(() => { /* fire-and-forget */ });
    }
  }

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

  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

  if (permanent) {
    await User.findByIdAndDelete(seeker.userId);
    await seeker.deleteOne();
    await logActivity({
      ...actorFromCtx(ctx),
      action: "job_seeker.delete",
      resource: "job_seekers",
      resourceId: params?.id,
      req,
    });
    return NextResponse.json({ message: "Job seeker permanently deleted" });
  }

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
