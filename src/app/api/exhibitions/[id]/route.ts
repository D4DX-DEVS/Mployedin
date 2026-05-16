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
import User from "@/models/User";
import { sendEmail } from "@/lib/communications/email";

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

    // Send email notification to agent on status change
    if (status) {
      sendExhibitionStatusEmail(item.agentId.toString(), item.eventName, status, reviewNote).catch(() => {});
    }

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

// ── Exhibition status email ──────────────────────────────────────────

const STATUS_EMAIL_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  under_review: { emoji: "🔍", color: "#2563eb", label: "Under Review" },
  approved: { emoji: "✅", color: "#059669", label: "Approved" },
  rejected: { emoji: "❌", color: "#dc2626", label: "Rejected" },
  revision_requested: { emoji: "✏️", color: "#d97706", label: "Revision Requested" },
  budget_approved: { emoji: "💰", color: "#059669", label: "Budget Approved" },
  resources_assigned: { emoji: "📦", color: "#7c3aed", label: "Resources Assigned" },
  active: { emoji: "🚀", color: "#059669", label: "Active" },
  completed: { emoji: "🏆", color: "#0891b2", label: "Completed" },
};

async function sendExhibitionStatusEmail(
  agentUserId: string,
  eventName: string,
  newStatus: string,
  reviewNote?: string,
) {
  const config = STATUS_EMAIL_CONFIG[newStatus];
  if (!config) return; // Don't email for trivial transitions

  const user = await User.findById(agentUserId).select("name email isActive").lean();
  if (!user?.email || !user.isActive) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://mployedin.com";
  const agentName = user.name ?? "Agent";

  const html = `
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto;background:#fff">
  <div style="background:linear-gradient(135deg,#0D6FD8 0%,#0A5BB8 100%);padding:24px;border-radius:8px 8px 0 0;text-align:center">
    <h1 style="color:#fff;margin:0;font-size:20px">MPLOYEDIN</h1>
    <p style="color:rgba(255,255,255,0.8);margin:4px 0 0;font-size:12px">Exhibition Request Update</p>
  </div>
  <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
    <p style="font-size:15px;color:#374151;margin:0 0 16px">Hi <strong>${esc(agentName)}</strong>,</p>
    <p style="font-size:14px;color:#6b7280;margin:0 0 20px">Your exhibition request has been updated:</p>

    <div style="background:${config.color}08;border:1px solid ${config.color}30;border-radius:8px;padding:16px;margin-bottom:20px">
      <p style="font-size:16px;font-weight:700;color:${config.color};margin:0">${config.emoji} ${config.label}</p>
      <p style="font-size:14px;color:#374151;margin:8px 0 0;font-weight:600">${esc(eventName)}</p>
    </div>

    ${reviewNote ? `
    <div style="background:#f9fafb;border-left:3px solid ${config.color};padding:12px 16px;margin-bottom:20px;border-radius:0 6px 6px 0">
      <p style="font-size:11px;font-weight:600;color:#6b7280;margin:0;text-transform:uppercase;letter-spacing:0.5px">Reviewer Note</p>
      <p style="font-size:14px;color:#374151;margin:6px 0 0">${esc(reviewNote)}</p>
    </div>` : ""}

    <div style="text-align:center;margin:24px 0">
      <a href="${baseUrl}/en/agent/exhibitions" style="background:#0D6FD8;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;display:inline-block">View Exhibition</a>
    </div>
  </div>
  <div style="padding:12px;text-align:center">
    <p style="color:#9ca3af;font-size:11px;margin:0">© ${new Date().getFullYear()} MPLOYEDIN</p>
  </div>
</div>`;

  await sendEmail({
    to: user.email,
    subject: `${config.emoji} Exhibition "${eventName}" — ${config.label}`,
    html,
    userId: agentUserId,
    source: "exhibition-status",
    category: "exhibitions",
  });
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
