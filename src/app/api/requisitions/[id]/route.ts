import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Requisition from "@/models/Requisition";
import Employer from "@/models/Employer";
import { logActivity } from "@/lib/audit/log";
import mongoose from "mongoose";

async function getHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const requisition = await Requisition.findById(id).lean();
  if (!requisition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // H1: object-level authz — only the owning employer (or admin) may read a requisition.
  if (ctx.role !== "admin") {
    const employer = await Employer.findOne({ userId: ctx.userId }).select("_id").lean();
    if (!employer || String(requisition.employerId) !== String(employer._id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json({ requisition });
}

async function patchHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const requisition = await Requisition.findOne({ _id: id, employerId: employer._id });
  if (!requisition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Status transitions
  if (body.status) {
    const validTransitions: Record<string, string[]> = {
      draft: ["pending_approval", "cancelled"],
      pending_approval: ["approved", "cancelled"],
      approved: ["open", "cancelled", "on_hold"],
      open: ["filled", "cancelled", "on_hold"],
      on_hold: ["open", "cancelled"],
    };
    const allowed = validTransitions[requisition.status] || [];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: `Cannot transition from ${requisition.status} to ${body.status}` }, { status: 400 });
    }
    requisition.status = body.status;
    if (body.status === "approved") {
      requisition.approvedAt = new Date();
      requisition.approvedBy = new mongoose.Types.ObjectId(ctx.userId);
    }
    if (["filled", "cancelled"].includes(body.status)) {
      requisition.closedAt = new Date();
      if (body.closedReason) requisition.closedReason = body.closedReason.trim();
    }
  }

  // Update fields
  if (body.title) requisition.title = body.title.trim();
  if (body.department) requisition.department = body.department.trim();
  if (body.priority) requisition.priority = body.priority;
  if (body.positions) requisition.positions = Math.max(1, body.positions);
  if (body.filledPositions !== undefined) requisition.filledPositions = body.filledPositions;
  if (body.jobId) requisition.jobId = new mongoose.Types.ObjectId(body.jobId);
  if (body.budgetMin !== undefined) requisition.budgetMin = body.budgetMin;
  if (body.budgetMax !== undefined) requisition.budgetMax = body.budgetMax;

  await requisition.save();

  await logActivity({ action: "requisition.updated", actorId: ctx.userId, resource: "Requisition", resourceId: id, meta: { status: requisition.status } });

  return NextResponse.json({ requisition });
}

async function deleteHandler(req: NextRequest, ctx: { userId: string; role: string }, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id || "";
  if (!mongoose.isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const employer = await Employer.findOne({ userId: ctx.userId }).lean();
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const requisition = await Requisition.findOneAndDelete({ _id: id, employerId: employer._id });
  if (!requisition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await logActivity({ action: "requisition.deleted", actorId: ctx.userId, resource: "Requisition", resourceId: id, meta: { title: requisition.title } });

  return NextResponse.json({ message: "Requisition deleted" });
}

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
