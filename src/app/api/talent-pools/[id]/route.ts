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

  // Remove candidate
  if (body.action === "remove_candidate") {
    const jobSeekerId = body.jobSeekerId;
    pool.candidates = pool.candidates.filter((c: any) => c.jobSeekerId.toString() !== jobSeekerId);
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
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
