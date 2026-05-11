import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";

/**
 * GET /api/exhibitions/[id] — get a single exhibition request
 */
async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;

  const item = await ExhibitionRequest.findById(id)
    .populate("agentId", "name email")
    .populate("reviewedBy", "name")
    .lean();

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Agents can only see their own
  if (ctx.role === "agent" && item.agentId?._id?.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(item);
}

/**
 * PATCH /api/exhibitions/[id] — update or approve/reject an exhibition request
 * - Agent: can update own pending requests
 * - Super Agent / Admin: can approve or reject
 */
async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;

  const item = await ExhibitionRequest.findById(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();

  // Agent updating their own pending request
  if (ctx.role === "agent") {
    if (item.agentId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (item.status !== "pending") {
      return NextResponse.json({ error: "Can only edit pending requests" }, { status: 400 });
    }
    const { eventName, description, eventLocation, eventStartDate, eventEndDate, participationType, participationDetails, estimatedBudget, budgetCurrency } = body;
    if (eventName) item.eventName = eventName.trim();
    if (description !== undefined) item.description = description?.trim();
    if (eventLocation !== undefined) item.eventLocation = eventLocation?.trim();
    if (eventStartDate) item.eventStartDate = new Date(eventStartDate);
    if (eventEndDate) item.eventEndDate = new Date(eventEndDate);
    if (participationType) item.participationType = participationType;
    if (participationDetails !== undefined) item.participationDetails = participationDetails?.trim();
    if (estimatedBudget !== undefined) item.estimatedBudget = estimatedBudget ? Number(estimatedBudget) : undefined;
    if (budgetCurrency) item.budgetCurrency = budgetCurrency;

    await item.save();
    return NextResponse.json(item);
  }

  // Super Agent or Admin: approve / reject
  if (ctx.role === "super_agent" || ctx.role === "admin") {
    const { status, reviewNote } = body;

    if (!status || !["approved", "rejected"].includes(status)) {
      return NextResponse.json({ error: "Status must be 'approved' or 'rejected'" }, { status: 400 });
    }

    item.status = status;
    item.reviewedBy = ctx.userId as unknown as typeof item.reviewedBy;
    item.reviewedAt = new Date();
    if (reviewNote) item.reviewNote = reviewNote.trim();
    item.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: ctx.userId as unknown as typeof item.reviewedBy,
      note: reviewNote?.trim(),
    });

    await item.save();
    return NextResponse.json(item);
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/**
 * DELETE /api/exhibitions/[id] — delete a pending request (agent own / admin)
 */
async function deleteHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;

  const item = await ExhibitionRequest.findById(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ctx.role === "agent") {
    if (item.agentId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (item.status !== "pending") {
      return NextResponse.json({ error: "Can only delete pending requests" }, { status: 400 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ExhibitionRequest.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "exhibitions", action: "read" });
export const DELETE = withAuth(deleteHandler, { resource: "exhibitions", action: "delete" });
