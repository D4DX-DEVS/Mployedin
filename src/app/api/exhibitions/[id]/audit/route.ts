import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";

/**
 * GET /api/exhibitions/[id]/audit
 *
 * Returns the full statusHistory audit trail for an exhibition request.
 * Accessible by admin and super_agent only.
 * Intentionally bypasses the isDeleted filter so audit records remain
 * available even after soft deletion.
 */
async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const item = await ExhibitionRequest.findById(params?.id)
    .select("eventName status statusHistory isDeleted deletedAt agentId")
    .populate("statusHistory.changedBy", "name")
    .populate("agentId", "name email")
    .lean();

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Super-agent access control: team jurisdiction only (mirrors the GET/PATCH
  // handlers in ../route.ts). Without this, any super_agent could read the full
  // decision history of exhibitions raised by other teams' agents.
  if (ctx.role === "super_agent") {
    const { getSuperAgentScope } = await import("@/lib/auth/agentRestrictions");
    const Agent = (await import("@/models/Agent")).default;
    const scope = await getSuperAgentScope(ctx.userId);
    const teamProfileIds = scope?.effectiveAgentIds ?? [];
    const teamUserIds = teamProfileIds.length
      ? (await Agent.find({ _id: { $in: teamProfileIds } }).select("userId").lean())
          .map((a) => String(a.userId))
      : [];
    const rawAgent = item.agentId as unknown as { _id?: unknown } | null;
    const requestAgentUserId = String(rawAgent?._id ?? item.agentId ?? "");
    if (!teamUserIds.includes(requestAgentUserId)) {
      return NextResponse.json(
        { error: "Forbidden — this request is not from your team" },
        { status: 403 },
      );
    }
  }

  const deriveActionType = (entry: { status?: string; note?: string; statusReason?: string }, prevStatus?: string): string => {
    if (entry.status === "budget_approved") return "BUDGET_APPROVED";
    if (entry.status === "resources_assigned") return "RESOURCES_ASSIGNED";
    if (entry.status === "archived") return "ARCHIVED";
    // If status didn't change from previous entry, treat as a comment/note
    if (prevStatus && entry.status === prevStatus && (entry.note || entry.statusReason)) {
      return "COMMENT_ADDED";
    }
    return "STATUS_CHANGED";
  };

  const history: Array<{ status?: string; changedAt?: unknown; changedBy?: unknown; approverRole?: string; note?: string; statusReason?: string }> = item.statusHistory ?? [];

  return NextResponse.json({
    exhibitionId: item._id,
    eventName: item.eventName,
    currentStatus: item.status,
    isDeleted: item.isDeleted ?? false,
    deletedAt: item.deletedAt ?? null,
    agent: item.agentId,
    auditTrail: history.map((entry, idx) => ({
      actionType: deriveActionType(entry, idx > 0 ? history[idx - 1].status : undefined),
      status: entry.status,
      changedAt: entry.changedAt,
      changedBy: entry.changedBy,
      approverRole: entry.approverRole ?? null,
      note: entry.note ?? null,
      statusReason: entry.statusReason ?? null,
    })),
    totalEntries: history.length,
  });
}

export const GET = withAuth(getHandler, { resource: "exhibitions", action: "read" });
