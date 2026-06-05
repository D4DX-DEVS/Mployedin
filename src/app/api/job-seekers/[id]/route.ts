import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import Agent from "@/models/Agent";
import ProfileView from "@/models/ProfileView";
import Employer from "@/models/Employer";
import { notify } from "@/lib/notifications/trigger";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { jobSeekerAdminUpdateSchema } from "@/lib/validators/job-seekers";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * Staff-only object-ownership guard for the plural /api/job-seekers/[id] route.
 * Self-service lives at /api/job-seeker/profile (singular). This route is for
 * staff management only and must never expose another user's PII by id.
 *  - admin: global access
 *  - agent: scoped to seekers assigned to this agent (seeker.agentId === agent._id)
 *  - super_agent: scoped to seekers whose agent is within their jurisdiction (read)
 *  - job_seeker / employer: denied
 * Returns a 403 NextResponse when access is not allowed, otherwise null.
 */
async function verifySeekerStaffAccess(seekerAgentId: unknown, ctx: AuthCtx): Promise<NextResponse | null> {
  if (ctx.role === "admin") return null;

  if (ctx.role === "agent") {
    const agent = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!agent || !seekerAgentId || String(seekerAgentId) !== String(agent._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  }

  if (ctx.role === "super_agent") {
    const scope = await getSuperAgentScope(ctx.userId);
    const ok = Boolean(
      seekerAgentId && scope?.effectiveAgentIds.some((id) => String(id) === String(seekerAgentId))
    );
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return null;
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id).populate("userId", "name email").lean();
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });

  const accessError = await verifySeekerStaffAccess(seeker.agentId, _ctx);
  if (accessError) return accessError;

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

      // Send "X viewed your CV" notification (Naukri-style)
      (async () => {
        try {
          let viewerName = "A recruiter";
          if (_ctx.role === "employer") {
            const emp = await Employer.findOne({ userId: _ctx.userId }).select("companyName").lean();
            if (emp) viewerName = (emp as Record<string, unknown>).companyName as string;
          } else {
            const viewer = await User.findById(_ctx.userId).select("name").lean();
            if (viewer) viewerName = (viewer as Record<string, unknown>).name as string;
          }
          await notify({
            userId: String(seeker.userId),
            type: "system",
            title: `${viewerName} viewed your profile`,
            message: `Your CV was viewed by ${viewerName}. Keep your profile updated to attract more opportunities.`,
            link: "/job-seeker/profile",
            sendEmail: true,
          });
        } catch { /* non-critical */ }
      })();
    }
  }

  return NextResponse.json({ jobSeeker: seeker });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id);
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });

  const accessError = await verifySeekerStaffAccess(seeker.agentId, ctx);
  if (accessError) return accessError;

  const body = await validateBody(req, jobSeekerAdminUpdateSchema) as Record<string, unknown>;
  const allowed = ["nationality", "currentLocation", "summary", "skills", "experience", "education", "languages"];
  const update: Record<string, unknown> = {};
  for (const k of allowed) if (body[k] !== undefined) update[k] = body[k];

  // SECURITY (W1-1): User-account fields (name/email) must never be mutated
  // through this profile route — that path enabled account takeover. Account
  // fields are managed only via the dedicated user-administration route.

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
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const seeker = await JobSeeker.findById(params?.id);
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });

  const permanent = new URL(req.url).searchParams.get("permanent") === "true";

  if (permanent) {
    const { cascadeDeleteJobSeeker } = await import("@/lib/db/cascade");
    const cascade = await cascadeDeleteJobSeeker(seeker.userId);
    await User.findByIdAndDelete(seeker.userId);
    await seeker.deleteOne();
    await logActivity({
      ...actorFromCtx(ctx),
      action: "job_seeker.delete",
      resource: "job_seekers",
      resourceId: params?.id,
      meta: { cascade },
      req,
    });
    return NextResponse.json({ message: "Job seeker permanently deleted", cascade });
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
