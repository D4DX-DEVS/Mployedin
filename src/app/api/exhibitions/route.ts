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
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
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
  const stage = searchParams.get("stage") ?? "";
  const dateRange = searchParams.get("dateRange") ?? "";
  const country = searchParams.get("country") ?? "";
  const budgetRange = searchParams.get("budgetRange") ?? "";
  const reviewer = searchParams.get("reviewer") ?? "";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { isDeleted: { $ne: true } };

  if (ctx.role === "agent") {
    query.agentId = ctx.userId;
  } else if (ctx.role === "super_agent") {
    // Canonical SA scope: getSuperAgentScope(). Do not read sa.agentIds directly.
    // ExhibitionRequest.agentId stores the Agent's User._id — map profile ids → userIds.
    const scope = await getSuperAgentScope(ctx.userId);
    const teamAgentDocIds = scope?.effectiveAgentIds ?? [];
    if (teamAgentDocIds.length === 0) {
      query.agentId = { $in: [] };
    } else {
      const agentProfiles = await Agent.find({ _id: { $in: teamAgentDocIds } })
        .select("userId").lean();
      query.agentId = { $in: agentProfiles.map((a) => a.userId) };
    }
  }
  const scopeQuery = { ...query };

  if (status && EXHIBITION_STATUSES.includes(status as never)) {
    query.status = status;
  }

  if (category && EXHIBITION_CATEGORIES.includes(category as never)) {
    query.eventCategory = category;
  }

  if (priority && EXHIBITION_PRIORITIES.includes(priority as never)) {
    query.priority = priority;
  }

  const stageStatuses: Record<string, string[]> = {
    team_leader: ["draft", "submitted", "under_review", "revision_requested"],
    finance: ["approved"],
    super_agent: ["budget_approved"],
    admin: ["resources_assigned", "active"],
    completed: ["completed", "rejected"],
  };
  if (stage && stageStatuses[stage]) {
    if (query.status) {
      query.$and = [...(query.$and ?? []), { status: query.status }, { status: { $in: stageStatuses[stage] } }];
      delete query.status;
    } else {
      query.status = { $in: stageStatuses[stage] };
    }
  }
  if (country) query.country = country;
  if (reviewer === "assigned") query.reviewedBy = { $exists: true, $ne: null };
  if (reviewer === "unassigned") query.$and = [
    ...(query.$and ?? []),
    { $or: [{ reviewedBy: { $exists: false } }, { reviewedBy: null }] },
  ];
  if (dateRange) {
    const days = parseInt(dateRange, 10);
    if (Number.isFinite(days) && days > 0) {
      query.createdAt = { $gte: new Date(Date.now() - days * 86400000) };
    }
  }
  if (budgetRange) {
    const [min, max] = budgetRange.split("-").map(Number);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      query.estimatedBudget = { $gte: min, $lte: max };
    }
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

  const [items, total, summaryRows, countries] = await Promise.all([
    ExhibitionRequest.find(query)
      .populate("agentId", "name email")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ExhibitionRequest.countDocuments(query),
    ExhibitionRequest.aggregate<{
      _id: null;
      total: number;
      pendingReview: number;
      financeReview: number;
      awaitingApproval: number;
      approved: number;
      rejected: number;
      budgetRequested: number;
      budgetApproved: number;
      budgetUtilized: number;
    }>([
      { $match: scopeQuery },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pendingReview: { $sum: { $cond: [{ $in: ["$status", ["submitted", "under_review"]] }, 1, 0] } },
          financeReview: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          awaitingApproval: { $sum: { $cond: [{ $in: ["$status", ["budget_approved", "resources_assigned"]] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $in: ["$status", ["budget_approved", "resources_assigned", "active"]] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
          budgetRequested: { $sum: { $ifNull: ["$estimatedBudget", 0] } },
          budgetApproved: { $sum: { $ifNull: ["$approvedBudget", 0] } },
          budgetUtilized: { $sum: { $ifNull: ["$actualSpend", 0] } },
        },
      },
    ]),
    ExhibitionRequest.distinct("country", { ...scopeQuery, country: { $nin: [null, ""] } }),
  ]);
  const summary = summaryRows[0] ?? {
    total: 0,
    pendingReview: 0,
    financeReview: 0,
    awaitingApproval: 0,
    approved: 0,
    rejected: 0,
    budgetRequested: 0,
    budgetApproved: 0,
    budgetUtilized: 0,
  };

  return NextResponse.json({
    items,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    summary,
    countries: countries.filter(Boolean).sort(),
  });
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
