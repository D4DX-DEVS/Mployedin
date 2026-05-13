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
  type ExhibitionRequestStatus,
} from "@/models/ExhibitionRequest";

/** Valid status transitions per role */
const VALID_TRANSITIONS: Record<string, Record<string, ExhibitionRequestStatus[]>> = {
  super_agent: {
    submitted: ["under_review", "rejected"],
    under_review: ["approved", "rejected", "revision_requested"],
    approved: ["budget_approved"],
    revision_requested: ["under_review"],
  },
  admin: {
    submitted: ["under_review", "approved", "rejected"],
    under_review: ["approved", "rejected", "revision_requested"],
    approved: ["budget_approved", "rejected"],
    revision_requested: ["under_review"],
    budget_approved: ["resources_assigned"],
    resources_assigned: ["active"],
    active: ["completed"],
    completed: ["archived"],
    rejected: ["archived"],
  },
};

async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const item = await ExhibitionRequest.findById(params?.id)
    .populate("agentId", "name email")
    .populate("reviewedBy", "name")
    .populate("statusHistory.changedBy", "name")
    .lean();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ctx.role === "agent" && item.agentId?._id?.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(item);
}

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const item = await ExhibitionRequest.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  // Agent editing own draft/submitted/revision_requested request
  if (ctx.role === "agent") {
    if (item.agentId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["draft", "submitted", "revision_requested"].includes(item.status)) {
      return NextResponse.json({ error: "Can only edit draft, submitted, or revision-requested requests" }, { status: 400 });
    }

    const {
      eventName, eventCategory, eventLocation, venue, country,
      eventStartDate, eventEndDate, organizerName, organizerContact,
      participationTypes, participationDetails,
      objectives,
      estimatedBudget, budgetBreakdown, budgetCurrency,
      description, executionPlan, expectedOutcome, expectedLeads,
      requiredResources, priority, venueNotes,
      status: newStatus,
    } = body;

    if (eventName !== undefined) item.eventName = eventName.trim();
    if (eventCategory !== undefined && EXHIBITION_CATEGORIES.includes(eventCategory)) item.eventCategory = eventCategory;
    if (eventLocation !== undefined) item.eventLocation = eventLocation.trim();
    if (venue !== undefined) item.venue = venue?.trim();
    if (country !== undefined) item.country = country?.trim();
    if (eventStartDate !== undefined) item.eventStartDate = new Date(eventStartDate);
    if (eventEndDate !== undefined) item.eventEndDate = new Date(eventEndDate);
    if (organizerName !== undefined) item.organizerName = organizerName?.trim();
    if (organizerContact !== undefined) item.organizerContact = organizerContact?.trim();
    if (participationTypes !== undefined) item.participationTypes = participationTypes;
    if (participationDetails !== undefined) item.participationDetails = participationDetails?.trim();
    if (objectives !== undefined) item.objectives = objectives;
    if (estimatedBudget !== undefined) item.estimatedBudget = Number(estimatedBudget) || 0;
    if (budgetBreakdown !== undefined) item.budgetBreakdown = budgetBreakdown;
    if (budgetCurrency !== undefined) item.budgetCurrency = budgetCurrency;
    if (description !== undefined) item.description = description?.trim();
    if (executionPlan !== undefined) item.executionPlan = executionPlan?.trim();
    if (expectedOutcome !== undefined) item.expectedOutcome = expectedOutcome?.trim();
    if (expectedLeads !== undefined) item.expectedLeads = expectedLeads ? Number(expectedLeads) : undefined;
    if (requiredResources !== undefined) item.requiredResources = requiredResources;
    if (priority !== undefined && EXHIBITION_PRIORITIES.includes(priority)) item.priority = priority;
    if (venueNotes !== undefined) item.venueNotes = venueNotes?.trim();

    // Agent can resubmit a revision_requested or draft
    if (newStatus === "submitted" && ["draft", "revision_requested"].includes(item.status)) {
      item.status = "submitted";
      item.statusHistory.push({
        status: "submitted",
        changedAt: new Date(),
        changedBy: ctx.userId as unknown as typeof item.reviewedBy,
        note: "Resubmitted",
      });
    }

    await item.save();
    return NextResponse.json(item);
  }

  // Super Agent or Admin: status transitions + budget management
  if (ctx.role === "super_agent" || ctx.role === "admin") {
    const { status, reviewNote, approvedBudget, budgetNotes, assignedTeam, actualSpend, priority } = body;

    if (status) {
      const allowed = VALID_TRANSITIONS[ctx.role]?.[item.status] ?? [];
      if (!allowed.includes(status)) {
        return NextResponse.json(
          { error: `Cannot transition from '${item.status}' to '${status}'` },
          { status: 400 },
        );
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
    }

    if (approvedBudget !== undefined) item.approvedBudget = Number(approvedBudget);
    if (actualSpend !== undefined) item.actualSpend = Number(actualSpend);
    if (budgetNotes !== undefined) item.budgetNotes = budgetNotes?.trim();
    if (assignedTeam !== undefined) item.assignedTeam = assignedTeam;
    if (priority !== undefined && EXHIBITION_PRIORITIES.includes(priority)) item.priority = priority;

    await item.save();
    return NextResponse.json(item);
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function deleteHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const item = await ExhibitionRequest.findById(params?.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ctx.role === "agent") {
    if (item.agentId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["draft", "submitted"].includes(item.status)) {
      return NextResponse.json({ error: "Can only delete draft or submitted requests" }, { status: 400 });
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ExhibitionRequest.findByIdAndDelete(params?.id);
  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "exhibitions", action: "read" });
export const DELETE = withAuth(deleteHandler, { resource: "exhibitions", action: "delete" });
