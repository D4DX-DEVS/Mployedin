import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { canStaffAccessSeeker, type SeekerOwnership } from "@/lib/jobSeeker/staffAccess";
import type { UserRole } from "@/models/User";
import { validateBody } from "@/lib/validators";
import { isValidObjectId } from "@/lib/security/sanitize";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const premiumSchema = z.object({ premium: z.boolean() });

/**
 * Staff mark a seeker premium (or take it back): the `premium` entry in
 * `badges[]` that the agent dashboard and the `?premium=1` list count. Same
 * "manage" ownership rule as PATCH /api/job-seekers/[id] — a seeker who is
 * only in the agent's area stays view-only.
 */
async function postHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  const { premium } = await validateBody(req, premiumSchema);
  await connectDB();

  const seeker = await JobSeeker.findById(params?.id)
    .select("_id agentId referral regionCityId regionStateId profileVisibility roleArchivedAt badges")
    .lean<SeekerOwnership & { badges?: string[] }>();
  if (!seeker) return NextResponse.json({ error: "Job seeker not found" }, { status: 404 });
  if (!(await canStaffAccessSeeker(seeker, ctx, "manage"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wasPremium = (seeker.badges ?? []).includes("premium");
  if (wasPremium !== premium) {
    await JobSeeker.updateOne(
      { _id: seeker._id },
      premium ? { $addToSet: { badges: "premium" } } : { $pull: { badges: "premium" } },
    );
    await logActivity({
      ...actorFromCtx(ctx),
      action: premium ? "job_seeker.premium_grant" : "job_seeker.premium_revoke",
      resource: "job_seekers",
      resourceId: params?.id,
      changes: { before: { premium: wasPremium }, after: { premium } },
      req,
    });
  }

  return NextResponse.json({ premium });
}

export const POST = withAuth(postHandler, { resource: "job_seekers", action: "update" });
