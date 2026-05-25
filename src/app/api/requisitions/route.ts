import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Requisition from "@/models/Requisition";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const filter: Record<string, unknown> = { employerId: employer._id };
  if (status) filter.status = status;

  const requisitions = await Requisition.find(filter).sort({ createdAt: -1 }).limit(100).lean();

  return NextResponse.json({ requisitions });
}

async function postHandler(req: NextRequest, ctx: { userId: string; role: string }) {
  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const body = await req.json();
  const { title, department, hiringManagerId, hiringManagerName, positions, justification } = body;

  if (!title || !department || !hiringManagerId || !justification) {
    return NextResponse.json({ error: "title, department, hiringManagerId, justification required" }, { status: 400 });
  }

  const requisition = await Requisition.create({
    employerId: employer._id,
    title: title.trim(),
    department: department.trim(),
    hiringManagerId: new mongoose.Types.ObjectId(hiringManagerId),
    hiringManagerName: hiringManagerName || "",
    positions: Math.max(1, Math.min(positions || 1, 100)),
    priority: body.priority || "medium",
    status: "draft",
    budgetMin: body.budgetMin || undefined,
    budgetMax: body.budgetMax || undefined,
    budgetCurrency: body.budgetCurrency || "USD",
    justification: justification.trim(),
    requirements: body.requirements ? body.requirements.trim() : undefined,
    targetStartDate: body.targetStartDate ? new Date(body.targetStartDate) : undefined,
    createdBy: new mongoose.Types.ObjectId(ctx.userId),
  });

  await logActivity({ action: "requisition.created", actorId: ctx.userId, resource: "Requisition", resourceId: requisition._id.toString(), meta: { title } });

  return NextResponse.json({ requisition }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
