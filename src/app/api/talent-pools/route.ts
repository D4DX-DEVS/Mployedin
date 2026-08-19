import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TalentPool from "@/models/TalentPool";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const pools = await TalentPool.find({ employerId: employer._id, isActive: true })
    .sort({ updatedAt: -1 })
    .populate({
      path: "candidates.jobSeekerId",
      select: "fullName userId",
      populate: { path: "userId", select: "avatar" },
    })
    .lean();

  return NextResponse.json({ pools });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();
  const name = body.name?.trim();
  const description = body.description?.trim() || "";
  const tags = (body.tags || []).map((t: string) => t.trim()).filter(Boolean).slice(0, 20);

  if (!name || name.length > 100) {
    return NextResponse.json({ error: "Name is required (max 100 chars)" }, { status: 400 });
  }

  const pool = await TalentPool.create({
    employerId: employer._id,
    name,
    description,
    tags,
    candidates: [],
    isActive: true,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "talent_pool.created", ...actorFromCtx(ctx), resource: "TalentPool", resourceId: pool._id.toString(), meta: { name } });

  return NextResponse.json({ pool }, { status: 201 });
}

export const GET = withAuth(getHandler);
// Guarded so withAuth's read-only sub-role check applies (withAuth.ts:270 skips it
// when no resource/action is declared). There is no talent_pools resource in the
// matrix; talent pools are employer-owned data, and employers:update is held by
// employer, agent and admin — the only roles with a UI path here.
export const POST = withAuth(postHandler, { resource: "employers", action: "update" });
