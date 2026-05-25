import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TalentPool from "@/models/TalentPool";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const pools = await TalentPool.find({ employerId: employer._id, isActive: true })
    .sort({ updatedAt: -1 })
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

  await logActivity({ action: "talent_pool.created", actorId: ctx.userId, resource: "TalentPool", resourceId: pool._id.toString(), meta: { name } });

  return NextResponse.json({ pool }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
