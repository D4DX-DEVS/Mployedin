import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { z } from "zod";
import { validateBody } from "@/lib/validators";
import SkillConfirmation from "@/models/SkillConfirmation";
import JobSeeker from "@/models/JobSeeker";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

const confirmationSchema = z.object({
  skill: z.string().min(1).max(100).trim(),
  status: z.enum(["confirmed", "denied", "skipped"]),
  source: z.enum(["job_view", "feed", "recommendation", "skills_coach"]).optional().default("job_view"),
  jobId: z.string().max(50).optional(),
});

async function recalcCompleteness(userId: string) {
  const doc = await JobSeeker.findOne({ userId }).lean();
  if (!doc) return;
  let completeness = 0;
  if (doc.userId) completeness += 10;
  if (doc.nationality) completeness += 10;
  if (doc.currentLocation) completeness += 5;
  if (doc.summary) completeness += 10;
  if (Array.isArray(doc.skills) && doc.skills.length) completeness += 20;
  if (Array.isArray(doc.experience) && doc.experience.length) completeness += 20;
  if (Array.isArray(doc.education) && doc.education.length) completeness += 15;
  if (Array.isArray(doc.languages) && doc.languages.length) completeness += 5;
  const hasLinkedin = doc.socialLinks?.some(
    (l: { label?: string }) => l.label?.toLowerCase() === "linkedin",
  );
  if (hasLinkedin) completeness += 5;
  completeness = Math.min(100, completeness);
  await JobSeeker.updateOne({ userId }, { $set: { profileCompleteness: completeness } });
}

async function postHandler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const body = await validateBody(req, confirmationSchema);
  const normalizedSkill = body.skill.toLowerCase().trim();

  // Upsert: allow overwriting a previous "skipped" but not confirmed/denied
  const existing = await SkillConfirmation.findOne({
    userId: ctx.userId,
    skill: normalizedSkill,
  }).lean();

  if (existing && existing.status !== "skipped" && body.status !== existing.status) {
    // Already confirmed or denied — update only if explicitly changing
    await SkillConfirmation.updateOne(
      { userId: ctx.userId, skill: normalizedSkill },
      { $set: { status: body.status, source: body.source, jobId: body.jobId } },
    );
  } else {
    await SkillConfirmation.findOneAndUpdate(
      { userId: ctx.userId, skill: normalizedSkill },
      {
        $set: {
          status: body.status,
          source: body.source,
          jobId: body.jobId,
        },
        $setOnInsert: { userId: ctx.userId, skill: normalizedSkill },
      },
      { upsert: true },
    );
  }

  // Sync with JobSeeker.skills
  if (body.status === "confirmed") {
    await JobSeeker.updateOne(
      { userId: ctx.userId },
      { $addToSet: { skills: body.skill.trim() } },
    );
    await recalcCompleteness(ctx.userId);
  } else if (body.status === "denied") {
    // Remove the skill (case-insensitive) from profile
    const seeker = await JobSeeker.findOne({ userId: ctx.userId });
    if (seeker) {
      const updated = seeker.skills.filter(
        (s: string) => s.toLowerCase() !== normalizedSkill,
      );
      if (updated.length !== seeker.skills.length) {
        seeker.skills = updated;
        await seeker.save();
        await recalcCompleteness(ctx.userId);
      }
    }
  }

  const confirmation = await SkillConfirmation.findOne({
    userId: ctx.userId,
    skill: normalizedSkill,
  }).lean();

  return NextResponse.json(confirmation, { status: 200 });
}

async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "job_seeker") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();
  const confirmations = await SkillConfirmation.find({ userId: ctx.userId })
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json({ confirmations });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
