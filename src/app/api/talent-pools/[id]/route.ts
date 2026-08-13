import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TalentPool from "@/models/TalentPool";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();

  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const pool = await TalentPool.findOne({ _id: id, employerId: employer._id })
    .populate({
      path: "candidates.jobSeekerId",
      select: "fullName headline skills currentLocation userId",
      populate: { path: "userId", select: "name email avatar" },
    })
    .lean();

  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 });

  return NextResponse.json({ pool });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();

  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const pool = await TalentPool.findOne({ _id: id, employerId: employer._id });
  if (!pool) return NextResponse.json({ error: "Pool not found" }, { status: 404 });

  const body = await req.json();

  // Add candidate
  if (body.action === "add_candidate") {
    const jobSeekerId = body.jobSeekerId;
    if (!mongoose.isValidObjectId(jobSeekerId)) return NextResponse.json({ error: "Invalid jobSeekerId" }, { status: 400 });

    const exists = pool.candidates.some((c: any) => c.jobSeekerId.toString() === jobSeekerId);
    if (exists) return NextResponse.json({ error: "Candidate already in pool" }, { status: 409 });

    // The employer must already have a legitimate relationship with this seeker.
    // Without this check pool membership is self-granted, and because
    // /api/employers/candidates/[id]/cv authorises on "applied to my job OR in my
    // talent pool", adding an arbitrary id here would unlock that seeker's CV and
    // documents — turning this endpoint into an arbitrary-PII read.
    const [{ default: Application }, { default: JobSeeker }] = await Promise.all([
      import("@/models/Application"),
      import("@/models/JobSeeker"),
    ]);
    const [hasApplied, alreadyPooled, seeker] = await Promise.all([
      Application.exists({ jobSeekerId, employerId: employer._id }),
      TalentPool.exists({ employerId: employer._id, "candidates.jobSeekerId": jobSeekerId }),
      JobSeeker.findById(jobSeekerId).select("profileVisibility").lean(),
    ]);
    if (!seeker) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    if (!hasApplied && !alreadyPooled && seeker.profileVisibility !== "visible") {
      return NextResponse.json(
        { error: "Forbidden — candidate has not applied to your jobs and their profile is not public" },
        { status: 403 }
      );
    }

    pool.candidates.push({
      jobSeekerId: new mongoose.Types.ObjectId(jobSeekerId),
      addedBy: new mongoose.Types.ObjectId(ctx.userId),
      addedAt: new Date(),
      source: body.source || "manual",
      sourceApplicationId: body.sourceApplicationId ? new mongoose.Types.ObjectId(body.sourceApplicationId) : undefined,
      notes: body.notes?.trim() || "",
      tags: (body.tags || []).map((t: string) => t.trim()).slice(0, 10),
    });
    await pool.save();

    await logActivity({ action: "talent_pool.candidate_added", actorId: ctx.userId, resource: "TalentPool", resourceId: id, meta: { jobSeekerId } });

    return NextResponse.json({ pool, message: "Candidate added" });
  }

  // Remove candidate — prefer the pool-candidate subdocument's own _id (always present,
  // unlike jobSeekerId which can point to a deleted/orphaned JobSeeker).
  if (body.action === "remove_candidate") {
    const candidateId = body.candidateId;
    const jobSeekerId = body.jobSeekerId;
    pool.candidates = pool.candidates.filter((c: any) => {
      if (candidateId) return c._id.toString() !== candidateId;
      return c.jobSeekerId?.toString() !== jobSeekerId;
    });
    await pool.save();
    return NextResponse.json({ pool, message: "Candidate removed" });
  }

  // Update pool metadata
  if (body.name) pool.name = body.name.trim();
  if (body.description !== undefined) pool.description = body.description.trim();
  if (body.tags) pool.tags = body.tags.map((t: string) => t.trim()).slice(0, 20);
  await pool.save();

  return NextResponse.json({ pool });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();

  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  await TalentPool.findOneAndUpdate({ _id: id, employerId: employer._id }, { isActive: false });

  return NextResponse.json({ message: "Pool archived" });
}

export const GET = withAuth(getHandler);
// See talent-pools/route.ts: employers:update stands in for a talent_pools resource
// the matrix does not define, and declaring it is what activates withAuth's
// read-only sub-role enforcement.
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "employers", action: "update" });
