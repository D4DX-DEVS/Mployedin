import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { escapeRegex } from "@/lib/security/sanitize";

/**
 * GET /api/exhibitions — list exhibition requests
 * - Admin: sees all
 * - Super Agent: sees requests from their agents
 * - Agent: sees own requests
 */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "10"));
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  // Scope by role
  if (ctx.role === "agent") {
    query.agentId = ctx.userId;
  } else if (ctx.role === "super_agent") {
    // Find the SuperAgent profile, then find agents under it
    const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (saProfile) {
      const agentProfiles = await Agent.find({ superAgentId: saProfile._id }).select("userId").lean();
      const agentUserIds = agentProfiles.map((a) => a.userId);
      query.agentId = { $in: agentUserIds };
    } else {
      query.agentId = { $in: [] }; // No profile found, return empty
    }
  }
  // admin sees all

  if (status && ["pending", "approved", "rejected"].includes(status)) {
    query.status = status;
  }

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { eventName: new RegExp(safe, "i") },
      { description: new RegExp(safe, "i") },
      { eventLocation: new RegExp(safe, "i") },
    ];
  }

  const [items, total] = await Promise.all([
    ExhibitionRequest.find(query)
      .populate("agentId", "name email")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ExhibitionRequest.countDocuments(query),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

/**
 * POST /api/exhibitions — create a new exhibition request (agent only)
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Only agents can submit exhibition requests" }, { status: 403 });
  }

  await connectDB();

  const body = await req.json();
  const { eventName, description, eventLocation, eventStartDate, eventEndDate, participationType, participationDetails, estimatedBudget, budgetCurrency } = body;

  if (!eventName || !eventStartDate || !eventEndDate || !participationType) {
    return NextResponse.json({ error: "Missing required fields: eventName, eventStartDate, eventEndDate, participationType" }, { status: 400 });
  }

  // Find the agent's super agent
  const agentProfile = await Agent.findOne({ userId: ctx.userId }).select("superAgentId").lean();

  const exhibition = await ExhibitionRequest.create({
    agentId: ctx.userId,
    superAgentId: agentProfile?.superAgentId ?? undefined,
    eventName: eventName.trim(),
    description: description?.trim(),
    eventLocation: eventLocation?.trim(),
    eventStartDate: new Date(eventStartDate),
    eventEndDate: new Date(eventEndDate),
    participationType,
    participationDetails: participationDetails?.trim(),
    estimatedBudget: estimatedBudget ? Number(estimatedBudget) : undefined,
    budgetCurrency: budgetCurrency ?? "USD",
    status: "pending",
    statusHistory: [{ status: "pending", changedAt: new Date(), changedBy: ctx.userId }],
  });

  return NextResponse.json(exhibition, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
export const POST = withAuth(postHandler, { resource: "exhibitions", action: "create" });
