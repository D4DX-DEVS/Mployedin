import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import EmailSequence from "@/models/EmailSequence";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const sequences = await EmailSequence.find({ employerId: employer._id })
    .select("-recipients")
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json({ sequences });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();
  const name = body.name?.trim();
  if (!name || name.length > 100) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const steps = (body.steps || []).slice(0, 10).map((s: { subject?: string; body?: string; delayDays?: number; condition?: string }, i: number) => ({
    order: i + 1,
    subject: s.subject?.trim() || "",
    body: s.body?.trim() || "",
    delayDays: Math.min(Math.max(s.delayDays || 1, 0), 90),
    condition: s.condition || undefined,
  }));

  const sequence = await EmailSequence.create({
    employerId: employer._id,
    name,
    description: body.description?.trim() || "",
    status: "draft",
    steps,
    recipients: [],
    fromName: body.fromName?.trim() || employer.companyName || "",
    fromEmail: body.fromEmail?.trim() || "",
    tags: (body.tags || []).map((t: string) => t.trim()).slice(0, 10),
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "email_sequence.created", actorId: ctx.userId, resource: "EmailSequence", resourceId: sequence._id.toString(), meta: { name } });

  return NextResponse.json({ sequence }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
