import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import EmailSequence from "@/models/EmailSequence";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const sequence = await EmailSequence.findOne({ _id: id, employerId: employer._id }).lean();
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  return NextResponse.json({ sequence });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const sequence = await EmailSequence.findOne({ _id: id, employerId: employer._id });
  if (!sequence) return NextResponse.json({ error: "Sequence not found" }, { status: 404 });

  const body = await req.json();

  // Update status
  if (body.status && ["draft", "active", "paused", "completed"].includes(body.status)) {
    sequence.status = body.status;
  }

  // Update steps
  if (body.steps) {
    sequence.steps = body.steps.slice(0, 10).map((s: { subject?: string; body?: string; delayDays?: number; condition?: string }, i: number) => ({
      order: i + 1,
      subject: s.subject?.trim() || "",
      body: s.body?.trim() || "",
      delayDays: Math.min(Math.max(s.delayDays || 1, 0), 90),
      condition: s.condition || undefined,
    }));
  }

  // Add recipients
  if (body.action === "add_recipients" && Array.isArray(body.recipients)) {
    const newRecipients = body.recipients.slice(0, 100).map((r: { email?: string; name?: string; jobSeekerId?: string }) => ({
      email: r.email?.trim() || "",
      name: r.name?.trim() || "",
      jobSeekerId: r.jobSeekerId ? new mongoose.Types.ObjectId(r.jobSeekerId) : undefined,
      currentStep: 0,
      status: "active" as const,
      nextSendAt: new Date(),
      openedSteps: [],
      clickedSteps: [],
    }));
    sequence.recipients.push(...newRecipients);
  }

  if (body.name) sequence.name = body.name.trim();
  if (body.description !== undefined) sequence.description = body.description.trim();
  if (body.fromName) sequence.fromName = body.fromName.trim();
  if (body.fromEmail) sequence.fromEmail = body.fromEmail.trim();

  await sequence.save();

  await logActivity({ action: "email_sequence.updated", actorId: ctx.userId, resource: "EmailSequence", resourceId: id, meta: { status: sequence.status } });

  return NextResponse.json({ sequence });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  await EmailSequence.findOneAndDelete({ _id: id, employerId: employer._id });

  return NextResponse.json({ message: "Sequence deleted" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
