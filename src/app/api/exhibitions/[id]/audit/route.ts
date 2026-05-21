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
