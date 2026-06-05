import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import JobSeeker from "@/models/JobSeeker";
import User, { type UserRole } from "@/models/User";
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

  return NextResponse.json(profile, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, jobSeekerProfileUpdateSchema);

  const { name, fullName, phone, ...profileUpdate } = body;
  const safeUpdate: Record<string, unknown> = { ...profileUpdate };

  const normalizedName = typeof fullName === "string"
    ? fullName.trim()
    : typeof name === "string"
      ? name.trim()
      : "";
  const normalizedPhone = typeof phone === "string" ? phone.trim() : "";
  const userUpdate: Record<string, string> = {};

  if (normalizedName) {
    userUpdate.name = normalizedName;
    safeUpdate.fullName = normalizedName;
  }

  if (normalizedPhone) {
    userUpdate.phone = normalizedPhone;
  }

  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate(ctx.userId, userUpdate, { runValidators: true });
  }

  const profile = await JobSeeker.findOneAndUpdate(
    { userId: ctx.userId },
    { $set: safeUpdate },
    { upsert: true, new: true, runValidators: true }
  );

  // Recalculate and persist profile completeness after every update
  let responseDoc = profile;
  if (profile) {
    const doc = profile.toObject ? profile.toObject() : profile;
    let completeness = 0;
    if (doc.userId)                                            completeness += 10;
    if (doc.nationality)                                       completeness += 10;
    if (doc.currentLocation)                                   completeness += 5;
    if (doc.summary)                                           completeness += 10;
    if (Array.isArray(doc.skills)    && doc.skills.length)    completeness += 20;
    if (Array.isArray(doc.experience)&& doc.experience.length) completeness += 20;
    if (Array.isArray(doc.education) && doc.education.length) completeness += 15;
    if (Array.isArray(doc.languages) && doc.languages.length) completeness += 5;
    if (doc.linkedin || doc.socialLinks?.some((l: { label?: string }) => l.label?.toLowerCase() === "linkedin")) completeness += 5;
    completeness = Math.min(100, completeness);
    await JobSeeker.updateOne({ userId: ctx.userId }, { $set: { profileCompleteness: completeness } });
    doc.profileCompleteness = completeness;
    responseDoc = doc;
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "job_seeker.update_profile",
    resource: "job_seekers",
    resourceId: ctx.userId,
    req,
  });

  return NextResponse.json(responseDoc);
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
