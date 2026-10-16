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
import logger from "@/lib/logger";
import { canMove, editNeedsReason, eventHasStarted, isClosedStatus } from "@/lib/exhibitions/transitions";
import { validateSupportItems } from "@/lib/exhibitions/supportItems";
import { withSignedAttachments } from "@/lib/exhibitions/attachments";
import { parseCompletionReport, parseReviewerEdits } from "@/lib/exhibitions/reviewerEdits";

/** Statuses that require a non-empty statusReason — enforced backend-side */
const REASON_REQUIRED: ExhibitionRequestStatus[] = ["rejected", "revision_requested"];

/** A super agent edits the request's facts only before it is resourced (admin: until it is closed). */
const SA_EDITABLE_STATUSES = ["submitted", "under_review", "revision_requested", "approved"];

async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const item = await ExhibitionRequest.findOne({
    _id: params?.id,
    isDeleted: { $ne: true },
  })
    .populate("agentId", "name email")
    .populate("reviewedBy", "name")
    .populate("budgetApprovedBy", "name")
    .populate("statusHistory.changedBy", "name")
    .populate("completionReport.completedBy", "name")
    .lean();

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ctx.role === "agent" && item.agentId?._id?.toString() !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Super agent access control: verify team jurisdiction (mirrors PATCH handler pattern)
  if (ctx.role === "super_agent") {
    const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
    const Agent = (await import("@/models/Agent")).default;
    const scope = await getSuperAgentScope(ctx.userId);
    const teamProfileIds = scope?.effectiveAgentIds ?? [];
    const teamUserIds = teamProfileIds.length
      ? (await Agent.find({ _id: { $in: teamProfileIds } }).select("userId").lean())
          .map((a) => String(a.userId))
      : [];
    // `agentId` is populated here, so `item.agentId.toString()` was
    // "[object Object]" and every super agent got 403 on their own team's request.
    const ownerId = String((item.agentId as { _id?: unknown } | null)?._id ?? item.agentId);
    if (!teamUserIds.includes(ownerId)) {
      return NextResponse.json(
        { error: "Forbidden — this request is not from your team" },
        { status: 403 },
      );
    }
  }
  return NextResponse.json(await withSignedAttachments(item));
}

async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const item = await ExhibitionRequest.findOne({
    _id: params?.id,
    isDeleted: { $ne: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  /* ------------------------------------------------------------------ */
  /*  Agent: edit own draft / submitted / revision_requested             */
  /* ------------------------------------------------------------------ */
  if (ctx.role === "agent") {
    if (item.agentId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The agent runs the event, so they report it done (client feedback
    // 2026-10-14). Photos go up through /attachments; this records the outcome.
    if (body.status === "completed") {
      if (!canMove("agent", item.status, "completed")) {
        return NextResponse.json(
          { error: "Only an approved event can be marked completed.", code: "INVALID_TRANSITION", from: item.status, to: "completed" },
          { status: 409 },
        );
      }
      // The event runs on its dates now that nobody marks it active, so the
      // report waits for the start date.
      if (!eventHasStarted(item.eventStartDate)) {
        return NextResponse.json(
          { error: "You can report the event once it has started.", code: "EVENT_NOT_STARTED" },
          { status: 409 },
        );
      }
      const report = parseCompletionReport(body.completionReport);
      if ("error" in report) return NextResponse.json({ error: report.error }, { status: 400 });
      item.status = "completed";
      item.completionReport = { ...report.value, completedAt: new Date(), completedBy: ctx.userId as unknown as typeof item.reviewedBy };
      item.statusHistory.push({
        status: "completed",
        changedAt: new Date(),
        changedBy: ctx.userId as unknown as typeof item.reviewedBy,
        note: report.value.summary ? report.value.summary.slice(0, 500) : "Event completed",
        approverRole: "agent",
      });
      await item.save();
      return NextResponse.json(await withSignedAttachments(item));
    }

    if (!["draft", "submitted", "revision_requested"].includes(item.status)) {
      return NextResponse.json(
        { error: "Can only edit draft, submitted, or revision-requested requests" },
        { status: 400 },
      );
    }

    const {
      eventName, eventCategory, eventLocation, venue, country,
      eventStartDate, eventEndDate, organizerName, organizerContact,
      participationTypes, participationDetails,
      objectives,
      estimatedBudget, budgetBreakdown, budgetCurrency,
      description, executionPlan, expectedOutcome, expectedLeads,
      requiredResources, priority, venueNotes,
      supportItems: rawSupportItems,
      additionalRequirements,
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

    // Validate support items if provided
    if (rawSupportItems !== undefined) {
      const validation = validateSupportItems(rawSupportItems);
      if (!validation.ok) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }
      item.supportItems = validation.items;
    }

    // Validate additionalRequirements if provided
    if (additionalRequirements !== undefined) {
      if (typeof additionalRequirements === "string") {
        if (additionalRequirements.length > 2000) {
          return NextResponse.json({ error: "additionalRequirements must be ≤ 2000 characters" }, { status: 400 });
        }
        item.additionalRequirements = additionalRequirements?.trim();
      }
    }

    const becameSubmitted =
      newStatus === "submitted" && ["draft", "revision_requested"].includes(item.status);
    if (becameSubmitted) {
      item.status = "submitted";
      item.statusHistory.push({
        status: "submitted",
        changedAt: new Date(),
        changedBy: ctx.userId as unknown as typeof item.reviewedBy,
        note: "Resubmitted",
        approverRole: "agent",
      });
    }

    await item.save();

    // Same queue signal as a first-time submission — a resubmitted request is
    // just as much work waiting on the super-agent.
    if (becameSubmitted && item.superAgentId) {
      const { notifySuperAgentOfExhibition } = await import("@/lib/notifications/exhibitionNotify");
      void notifySuperAgentOfExhibition(
        String(item.superAgentId),
        ctx.userId,
        item.eventName,
        item._id.toString(),
        ctx.locale,
      );
    }

    return NextResponse.json(await withSignedAttachments(item));
  }

  /* ------------------------------------------------------------------ */
  /*  Super Agent / Admin: status transitions + budget management        */
  /* ------------------------------------------------------------------ */
  if (ctx.role === "super_agent" || ctx.role === "admin") {
    // Jurisdiction: a super-agent may only review requests from their own team.
    // The status transitions below were role-gated but never scope-gated, so any
    // super-agent could approve/reject any agent's request platform-wide. This was
    // unreachable while the route guard blocked super_agent entirely; it becomes
    // live now that exhibitions:update is granted, so the check has to exist here.
    // agentId stores the Agent's User._id, so team profile ids are mapped to userIds
    // (same mapping as GET /api/exhibitions).
    if (ctx.role === "super_agent") {
      const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
      const Agent = (await import("@/models/Agent")).default;
      const scope = await getSuperAgentScope(ctx.userId);
      const teamProfileIds = scope?.effectiveAgentIds ?? [];
      const teamUserIds = teamProfileIds.length
        ? (await Agent.find({ _id: { $in: teamProfileIds } }).select("userId").lean())
            .map((a) => String(a.userId))
        : [];
      if (!teamUserIds.includes(item.agentId.toString())) {
        return NextResponse.json(
          { error: "Forbidden — this request is not from your team" },
          { status: 403 },
        );
      }
    }

    const {
      status,
      approvedBudget,
      budgetNotes,
      assignedTeam,
      actualSpend,
      priority,
      details,
      completionReport,
    } = body;
    // Free text only: a non-string used to throw on .trim() (a 500).
    const reviewNote: string | undefined = typeof body.reviewNote === "string" ? body.reviewNote.slice(0, 2000) : undefined;
    const statusReason: string | undefined = typeof body.statusReason === "string" ? body.statusReason.slice(0, 2000) : undefined;
    const previousStatus = item.status;

    /**
     * A money figure must be a finite number that is not negative.
     *
     * `Number.isFinite` alone let `-500` straight through to a schema that
     * declares `min: 0`, so the write failed inside `save()` as an unhandled
     * ValidationError — a 500 where the caller deserved a 400 naming the
     * field. Rejecting it here means the caller is told what is wrong.
     */
    const parseMoney = (raw: unknown, field: string): number | { error: string } => {
      const value = Number(raw);
      if (!Number.isFinite(value)) return { error: `${field} must be a valid number` };
      if (value < 0) return { error: `${field} cannot be negative` };
      return value;
    };

    if (status) {
      if (!canMove(ctx.role, item.status, status)) {
        // Usually a stale screen: someone else already moved the request on.
        return NextResponse.json(
          {
            error: "This request has already moved to another stage, so that action no longer applies. Reload to see where it stands.",
            code: "INVALID_TRANSITION",
            from: item.status,
            to: status,
          },
          { status: 409 },
        );
      }

      // Backend enforcement: rejection and revision need a reason.
      if (REASON_REQUIRED.includes(status as ExhibitionRequestStatus)) {
        const reason = (statusReason?.trim() || reviewNote?.trim()) ?? "";
        if (!reason) {
          return NextResponse.json(
            { error: status === "rejected" ? "Give the agent a reason for rejecting this request." : "Tell the agent what needs to change." },
            { status: 422 },
          );
        }
      }

      // Approving the payment also decides the support: what each requested
      // item gets (0 is a decision too). Budget approval, Assign resources and
      // Mark active used to be three separate admin moves (owner, 2026-10-15).
      if (status === "budget_approved") {
        const undecided = (item.supportItems ?? []).filter((s: { allocatedQty?: number }) => typeof s.allocatedQty !== "number");
        if (undecided.length > 0) {
          return NextResponse.json(
            { error: "Decide an allocation for every requested item first (0 is allowed).", code: "ALLOCATION_REQUIRED" },
            { status: 422 },
          );
        }
      }

      const resolvedReason = (statusReason ?? "").trim() || undefined;
      const resolvedNote = (reviewNote ?? "").trim() || undefined;

      if (status === "completed" && completionReport !== undefined) {
        const report = parseCompletionReport(completionReport);
        if ("error" in report) return NextResponse.json({ error: report.error }, { status: 400 });
        item.completionReport = { ...report.value, completedAt: new Date(), completedBy: ctx.userId as unknown as typeof item.reviewedBy };
      }

      item.status = status;
      item.reviewedBy = ctx.userId as unknown as typeof item.reviewedBy;
      item.reviewedAt = new Date();
      if (resolvedNote) item.reviewNote = resolvedNote;

      // Set budget approval metadata (immutable once set — only assign if not already set)
      if (status === "budget_approved" && !item.budgetApprovedBy) {
        item.budgetApprovedBy = ctx.userId as unknown as typeof item.budgetApprovedBy;
        item.budgetApprovedAt = new Date();
        // Lock in approvedBudget at financial approval time
        if (approvedBudget !== undefined) {
          const budgetNum = parseMoney(approvedBudget, "approvedBudget");
          if (typeof budgetNum !== "number") {
            return NextResponse.json({ error: budgetNum.error }, { status: 400 });
          }
          item.approvedBudget = budgetNum;
        }
      }

      /**
       * A super-agent's operational approval records a *recommendation*.
       *
       * Their dialog has always offered a "Recommended Budget" field, but
       * neither branch below accepted it: the first needs status
       * `budget_approved` (a transition this role cannot make) and the second
       * needs the admin role. Every figure a super-agent typed was discarded
       * with no error and no trace — five approved requests carried no budget
       * at all. It is kept separate from `approvedBudget` so the advisory
       * figure can never be mistaken for the binding one.
       */
      if (status === "approved" && ctx.role === "super_agent" && approvedBudget !== undefined) {
        const recommended = parseMoney(approvedBudget, "recommendedBudget");
        if (typeof recommended !== "number") {
          return NextResponse.json({ error: recommended.error }, { status: 400 });
        }
        item.recommendedBudget = recommended;
        item.recommendedBudgetBy = ctx.userId as unknown as typeof item.recommendedBudgetBy;
        item.recommendedBudgetAt = new Date();
      }

      item.statusHistory.push({
        status: status as ExhibitionRequestStatus,
        changedAt: new Date(),
        changedBy: ctx.userId as unknown as typeof item.reviewedBy,
        // An admin completing the event usually writes the outcome, not a note.
        note: resolvedNote ?? (status === "completed" ? item.completionReport?.summary?.slice(0, 500) : undefined),
        approverRole: ctx.role,
        statusReason: resolvedReason,
      });
    }

    // The outcome of a finished event: the admin records or corrects the leads
    // collected and the summary afterwards (events closed from the admin side
    // used to be left with no outcome at all).
    if (!status && completionReport !== undefined) {
      if (ctx.role !== "admin" || item.status !== "completed") {
        return NextResponse.json({ error: "The outcome can be recorded once the event is completed." }, { status: 409 });
      }
      const report = parseCompletionReport(completionReport);
      if ("error" in report) return NextResponse.json({ error: report.error }, { status: 400 });
      const previous = item.completionReport;
      item.completionReport = {
        actualLeads: report.value.actualLeads,
        summary: report.value.summary,
        completedAt: previous?.completedAt ?? new Date(),
        completedBy: previous?.completedBy ?? (ctx.userId as unknown as typeof item.reviewedBy),
      };
      item.statusHistory.push({
        status: item.status,
        changedAt: new Date(),
        changedBy: ctx.userId as unknown as typeof item.reviewedBy,
        note: "Event outcome updated",
        approverRole: ctx.role,
      });
    }

    // A settled event is the final record: its money no longer changes.
    const touchesMoney = (approvedBudget !== undefined && status !== "budget_approved") || actualSpend !== undefined;
    if (ctx.role === "admin" && touchesMoney && previousStatus === "archived") {
      return NextResponse.json({ error: "This event's balance is settled, so its amounts can't change." }, { status: 409 });
    }

    // The approved amount is corrected in place instead of stepping the
    // request back. Once it was approved for payment, a change needs a reason,
    // is logged old to new, and the agent and super agent are told.
    let budgetChange: { from: number; to: number; reason: string } | null = null;
    if (approvedBudget !== undefined && status !== "budget_approved" && ctx.role === "admin") {
      const budgetNum = parseMoney(approvedBudget, "approvedBudget");
      if (typeof budgetNum !== "number") {
        return NextResponse.json({ error: budgetNum.error }, { status: 400 });
      }
      const before = item.approvedBudget ?? 0;
      if (budgetNum !== before && editNeedsReason(previousStatus)) {
        const reason = statusReason?.trim() || "";
        if (!reason) {
          return NextResponse.json({ error: "Say why the approved budget is changing.", code: "REASON_REQUIRED" }, { status: 422 });
        }
        budgetChange = { from: before, to: budgetNum, reason };
        item.statusHistory.push({
          status: item.status,
          changedAt: new Date(),
          changedBy: ctx.userId as unknown as typeof item.reviewedBy,
          note: `Approved budget changed from ${item.budgetCurrency ?? ""} ${before} to ${item.budgetCurrency ?? ""} ${budgetNum}`.replace(/ {2,}/g, " "),
          approverRole: ctx.role,
          statusReason: reason,
        });
      }
      item.approvedBudget = budgetNum;
    }
    // Spend, budget notes and the team are the admin's record. A super agent
    // could write them at any stage, and an empty team undid Assign resources.
    if (actualSpend !== undefined && ctx.role === "admin") {
      const spend = parseMoney(actualSpend, "actualSpend");
      if (typeof spend !== "number") {
        return NextResponse.json({ error: spend.error }, { status: 400 });
      }
      item.actualSpend = spend;
    }
    if (budgetNotes !== undefined && ctx.role === "admin" && typeof budgetNotes === "string") item.budgetNotes = budgetNotes.trim();
    if (assignedTeam !== undefined && ctx.role === "admin" && Array.isArray(assignedTeam)) {
      const team = assignedTeam.filter((m: unknown): m is string => typeof m === "string" && m.trim().length > 0).map((m: string) => m.trim());
      // Past Assign resources the team is required; it can change, not empty.
      const needsTeam = ["resources_assigned", "active", "completed"].includes(String(status ?? item.status));
      if (needsTeam && team.length === 0) {
        return NextResponse.json({ error: "Name at least one person on the team.", code: "TEAM_REQUIRED" }, { status: 422 });
      }
      item.assignedTeam = team;
    }

    // Who set the priority, and when, is part of the record.
    // A super agent sets priority while the request is theirs to review.
    // Priority orders the review queue, so a closed request keeps the one it had.
    const mayPrioritise = ctx.role === "admin" ? !isClosedStatus(item.status) : SA_EDITABLE_STATUSES.includes(item.status);
    if (priority !== undefined && priority !== item.priority && !mayPrioritise) {
      return NextResponse.json({ error: "Priority can no longer be changed at this stage." }, { status: 409 });
    }
    if (priority !== undefined && EXHIBITION_PRIORITIES.includes(priority) && priority !== item.priority) {
      item.statusHistory.push({
        status: item.status,
        changedAt: new Date(),
        changedBy: ctx.userId as unknown as typeof item.reviewedBy,
        note: `Priority changed from ${item.priority} to ${priority}`,
        approverRole: ctx.role,
      });
      item.priority = priority;
    }

    // Reviewer edits to the request's facts (client feedback 2026-10-14: no
    // edit option for super agent or admin), logged with the fields changed.
    if (details !== undefined) {
      const editable = ctx.role === "admin" ? !isClosedStatus(item.status) : SA_EDITABLE_STATUSES.includes(item.status);
      if (!editable) {
        return NextResponse.json({ error: "This request can no longer be edited at its current stage." }, { status: 409 });
      }
      const edits = parseReviewerEdits(details);
      if ("error" in edits) return NextResponse.json({ error: edits.error }, { status: 400 });
      const comparable = (v: unknown) => (v instanceof Date ? v.toISOString() : v ?? null);
      const changed = Object.entries(edits.value).filter(([key, value]) => comparable(item.get(key)) !== comparable(value));
      // Past the payment approval the edit changes what two people signed
      // off, so it says why and keeps the old values.
      const signedOff = editNeedsReason(item.status);
      const editReason = statusReason?.trim() || "";
      if (signedOff && changed.length > 0 && !editReason) {
        return NextResponse.json({ error: "Say why these details are changing after approval.", code: "REASON_REQUIRED" }, { status: 422 });
      }
      const shown = (v: unknown) => {
        const value = comparable(v);
        if (value === null || value === "") return "-";
        return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : String(value);
      };
      const oldToNew = changed.map(([key, value]) => `${key}: ${shown(item.get(key))} → ${shown(value)}`);
      for (const [key, value] of changed) item.set(key, value ?? undefined);
      // Checked on the merged dates: editing only the start could pass an end before it.
      if (item.eventStartDate && item.eventEndDate && new Date(item.eventEndDate) < new Date(item.eventStartDate)) {
        return NextResponse.json({ error: "The end date can't be before the start date." }, { status: 400 });
      }
      if (changed.length > 0) {
        item.statusHistory.push({
          status: item.status,
          changedAt: new Date(),
          changedBy: ctx.userId as unknown as typeof item.reviewedBy,
          note: signedOff
            ? `Details edited: ${oldToNew.join("; ")}`.slice(0, 1000)
            : `Details edited: ${changed.map(([key]) => key).join(", ")}`,
          approverRole: ctx.role,
          statusReason: signedOff ? editReason : undefined,
        });
      }
    }

    // A schema violation is bad input, not a server fault. Unguarded, it left
    // the handler as an unhandled rejection and the caller saw a bare 500.
    // Matched by name rather than `instanceof mongoose.Error.ValidationError`:
    // importing the mongoose value here drags its ESM `bson` dependency into
    // anything that loads this route, and the name is stable across instances.
    try {
      await item.save();
    } catch (err) {
      const validation = err as { name?: string; errors?: Record<string, { message?: string }> };
      if (validation?.name === "ValidationError" && validation.errors) {
        const detail = Object.values(validation.errors)
          .map((e) => e?.message)
          .filter(Boolean)
          .join("; ");
        return NextResponse.json({ error: detail || "Invalid exhibition data" }, { status: 400 });
      }
      throw err;
    }

    if (status) {
      sendExhibitionStatusEmail(
        item.agentId.toString(),
        item.eventName,
        status,
        statusReason?.trim() || reviewNote?.trim() || undefined,
      ).catch((err) => logger.error({ err, exhibitionId: item._id.toString() }, "Failed to send exhibition status email"));
    }

    if (budgetChange) {
      void notifyBudgetChange(item, budgetChange, ctx.userId);
    }

    return NextResponse.json(await withSignedAttachments(item));
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

/** Tell the agent and their super agent the approved amount moved. Never throws. */
async function notifyBudgetChange(
  item: { _id: unknown; agentId: unknown; superAgentId?: unknown; eventName: string; budgetCurrency?: string },
  change: { from: number; to: number; reason: string },
  actorId: string,
) {
  try {
    const [{ notifyExhibitionBudgetChanged }, { default: SuperAgent }] = await Promise.all([
      import("@/lib/notifications/trigger"),
      import("@/models/SuperAgent"),
    ]);
    const sa = item.superAgentId ? await SuperAgent.findById(item.superAgentId).select("userId").lean() : null;
    const currency = item.budgetCurrency ?? "";
    const money = (amount: number) => `${currency} ${amount.toLocaleString("en")}`.trim();
    await notifyExhibitionBudgetChanged(
      [String(item.agentId), ...(sa?.userId ? [String(sa.userId)] : [])],
      item.eventName,
      money(change.from),
      money(change.to),
      change.reason,
      "/agent/exhibitions",
      actorId,
    );
  } catch (err) {
    logger.error({ err, exhibitionId: String(item._id) }, "Failed to notify exhibition budget change");
  }
}

async function deleteHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const item = await ExhibitionRequest.findOne({
    _id: params?.id,
    isDeleted: { $ne: true },
  });
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (ctx.role === "agent") {
    if (item.agentId.toString() !== ctx.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!["draft", "submitted"].includes(item.status)) {
      return NextResponse.json(
        { error: "Can only delete draft or submitted requests" },
        { status: 400 },
      );
    }
  } else if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete — preserve record for audit/compliance. Only these fields are
  // written: save() re-validates the whole document, so an older record that
  // no longer fits the schema (e.g. a "pending" history entry, no category)
  // could never be deleted.
  await ExhibitionRequest.updateOne(
    { _id: item._id },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: ctx.userId } },
  );

  return NextResponse.json({ success: true });
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "exhibitions", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "exhibitions", action: "delete" });

// ── Exhibition status email ──────────────────────────────────────────

const STATUS_EMAIL_CONFIG: Record<string, { emoji: string; color: string; label: string }> = {
  under_review: { emoji: "🔍", color: "#2563eb", label: "Under Review" },
  approved: { emoji: "✅", color: "#059669", label: "Operationally Approved" },
  rejected: { emoji: "❌", color: "#dc2626", label: "Rejected" },
  revision_requested: { emoji: "✏️", color: "#d97706", label: "Revision Requested" },
  budget_approved: { emoji: "💰", color: "#059669", label: "Payment Approved" },
  resources_assigned: { emoji: "📦", color: "#7c3aed", label: "Resources Assigned" },
  active: { emoji: "🚀", color: "#059669", label: "Active" },
  completed: { emoji: "🏆", color: "#0891b2", label: "Completed" },
};

async function sendExhibitionStatusEmail(
  agentUserId: string,
  eventName: string,
  newStatus: string,
  reason?: string,
) {
  const config = STATUS_EMAIL_CONFIG[newStatus];
  if (!config) return;

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

    ${reason ? `
    <div style="background:#f9fafb;border-left:3px solid ${config.color};padding:12px 16px;margin-bottom:20px;border-radius:0 6px 6px 0">
      <p style="font-size:11px;font-weight:600;color:#6b7280;margin:0;text-transform:uppercase;letter-spacing:0.5px">Reviewer Note</p>
      <p style="font-size:14px;color:#374151;margin:6px 0 0">${esc(reason)}</p>
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
