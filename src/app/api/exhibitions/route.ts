import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest, {
  EXHIBITION_STATUSES,
  EXHIBITION_CATEGORIES,
  EXHIBITION_PARTICIPATION_TYPES,
  EXHIBITION_OBJECTIVES,
  EXHIBITION_RESOURCE_TYPES,
  EXHIBITION_PRIORITIES,
} from "@/models/ExhibitionRequest";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import { escapeRegex } from "@/lib/security/sanitize";

async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
  const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "50"));
  const search = searchParams.get("search") ?? "";
  const status = searchParams.get("status") ?? "";
  const category = searchParams.get("category") ?? "";
  const priority = searchParams.get("priority") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = {};

  if (ctx.role === "agent") {
    query.agentId = ctx.userId;
  } else if (ctx.role === "super_agent") {
    const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (saProfile) {
      const agentProfiles = await Agent.find({ superAgentId: saProfile._id }).select("userId").lean();
      query.agentId = { $in: agentProfiles.map((a) => a.userId) };
    } else {
      query.agentId = { $in: [] };
    }
  }

  if (status && EXHIBITION_STATUSES.includes(status as never)) {
    query.status = status;
  }

  if (category && EXHIBITION_CATEGORIES.includes(category as never)) {
    query.eventCategory = category;
  }

  if (priority && EXHIBITION_PRIORITIES.includes(priority as never)) {
    query.priority = priority;
  }

  if (search) {
    const safe = escapeRegex(search);
    query.$or = [
      { eventName: new RegExp(safe, "i") },
      { description: new RegExp(safe, "i") },
      { eventLocation: new RegExp(safe, "i") },
      { venue: new RegExp(safe, "i") },
      { country: new RegExp(safe, "i") },
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

  return NextResponse.json({ items, total, page, totalPages: Math.ceil(total / limit) });
}

async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "agent") {
    return NextResponse.json({ error: "Only agents can submit exhibition requests" }, { status: 403 });
  }

  await connectDB();
  const body = await req.json();
  const {
    eventName, eventCategory, eventLocation, venue, country,
    eventStartDate, eventEndDate, organizerName, organizerContact,
    participationTypes, participationDetails,
    objectives,
    estimatedBudget, budgetBreakdown, budgetCurrency,
    description, executionPlan, expectedOutcome, expectedLeads,
    requiredResources,
    priority, venueNotes,
    status: requestedStatus,
  } = body;

  if (!eventName) {
    return NextResponse.json({ error: "Missing required field: eventName" }, { status: 400 });
  }

  if (eventCategory && !EXHIBITION_CATEGORIES.includes(eventCategory)) {
    return NextResponse.json({ error: "Invalid event category" }, { status: 400 });
  }

  // Validate arrays
  if (participationTypes?.length) {
    for (const pt of participationTypes) {
      if (!EXHIBITION_PARTICIPATION_TYPES.includes(pt)) {
        return NextResponse.json({ error: `Invalid participation type: ${pt}` }, { status: 400 });
      }
    }
  }

  if (objectives?.length) {
    for (const obj of objectives) {
      if (!EXHIBITION_OBJECTIVES.includes(obj)) {
        return NextResponse.json({ error: `Invalid objective: ${obj}` }, { status: 400 });
      }
    }
  }

  if (requiredResources?.length) {
    for (const res of requiredResources) {
      if (!EXHIBITION_RESOURCE_TYPES.includes(res)) {
        return NextResponse.json({ error: `Invalid resource type: ${res}` }, { status: 400 });
      }
    }
  }

  const agentProfile = await Agent.findOne({ userId: ctx.userId }).select("superAgentId").lean();

  const initialStatus = requestedStatus === "draft" ? "draft" : "submitted";

  const exhibition = await ExhibitionRequest.create({
    agentId: ctx.userId,
    superAgentId: agentProfile?.superAgentId ?? undefined,
    eventName: eventName.trim(),
    eventCategory: eventCategory || "career_fair",
    eventLocation: eventLocation?.trim() || "TBD",
    venue: venue?.trim(),
    country: country?.trim(),
    eventStartDate: eventStartDate ? new Date(eventStartDate) : undefined,
    eventEndDate: eventEndDate ? new Date(eventEndDate) : undefined,
    organizerName: organizerName?.trim(),
    organizerContact: organizerContact?.trim(),
    participationTypes: participationTypes ?? [],
    participationDetails: participationDetails?.trim(),
    objectives: objectives ?? [],
    estimatedBudget: estimatedBudget ? Number(estimatedBudget) : 0,
    budgetBreakdown: budgetBreakdown ?? undefined,
    budgetCurrency: budgetCurrency ?? "USD",
    description: description?.trim(),
    executionPlan: executionPlan?.trim(),
    expectedOutcome: expectedOutcome?.trim(),
    expectedLeads: expectedLeads ? Number(expectedLeads) : undefined,
    requiredResources: requiredResources ?? [],
    priority: priority && EXHIBITION_PRIORITIES.includes(priority) ? priority : "medium",
    venueNotes: venueNotes?.trim(),
    status: initialStatus,
    statusHistory: [{ status: initialStatus, changedAt: new Date(), changedBy: ctx.userId }],
  });

  return NextResponse.json(exhibition, { status: 201 });
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
export const POST = withAuth(postHandler, { resource: "exhibitions", action: "create" });
