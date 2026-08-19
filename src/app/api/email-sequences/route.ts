import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import EmailSequence from "@/models/EmailSequence";
import Employer from "@/models/Employer";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { escapeRegex } from "@/lib/security/sanitize";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "10", 10) || 10));
  const search = searchParams.get("search")?.trim() ?? "";
  const status = searchParams.get("status") ?? "";
  const query: Record<string, unknown> = { employerId: employer._id };
  if (status && ["draft", "active", "paused", "completed"].includes(status)) query.status = status;
  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { name: { $regex: safe, $options: "i" } },
      { description: { $regex: safe, $options: "i" } },
    ];
  }

  const [sequences, total] = await Promise.all([
    EmailSequence.find(query)
      .select("-recipients")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    EmailSequence.countDocuments(query),
  ]);

  return NextResponse.json({
    sequences,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
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

  await logActivity({ action: "email_sequence.created", ...actorFromCtx(ctx), resource: "EmailSequence", resourceId: sequence._id.toString(), meta: { name } });

  return NextResponse.json({ sequence }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
