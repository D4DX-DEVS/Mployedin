import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import BackgroundCheck from "@/models/BackgroundCheck";
import { staffActor, staffCheckFilter } from "@/lib/backgroundChecks/scope";
import { buildStaffListFilter } from "@/lib/backgroundChecks/listFilters";
import { refId, viewerFlags, type CheckActor } from "@/lib/backgroundChecks/workflow";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const STAFF_ROLES: readonly string[] = ["agent", "super_agent", "admin"];
const PAGE_SIZES = [10, 20, 50, 100];

interface StoredCheck {
  _id: unknown;
  status?: string;
  outcome?: string;
  checkType?: string;
  requestedAt?: Date | string;
  completedAt?: Date | string;
  applicationId?: unknown;
  jobSeekerId?: { fullName?: string; userId?: { name?: string } | null } | null;
  jobId?: { title?: string } | null;
  employerId?: { companyName?: string } | null;
  references?: Array<{ status?: string }>;
  assignedTo?: { _id: unknown; name?: string; email?: string; role?: string } | null;
}

/**
 * One row of the staff list: where the check stands, who holds it and what
 * this viewer may do. The list carries reference COUNTS only; the referees'
 * details come with the detail view (GET /api/background-checks/[id]), and the
 * employer's own notes never reach staff at all.
 */
function toStaffView(check: StoredCheck, actor: CheckActor) {
  const references = check.references ?? [];
  return {
    _id: check._id,
    status: check.status,
    outcome: check.outcome,
    checkType: check.checkType,
    requestedAt: check.requestedAt,
    ...(check.completedAt ? { completedAt: check.completedAt } : {}),
    applicationId: check.applicationId,
    candidateName: check.jobSeekerId?.fullName || check.jobSeekerId?.userId?.name || "",
    jobTitle: check.jobId?.title ?? "",
    companyName: check.employerId?.companyName ?? "",
    references: {
      total: references.length,
      responded: references.filter((r) => r.status === "responded").length,
      declined: references.filter((r) => r.status === "declined").length,
    },
    assignee: check.assignedTo
      ? {
          name: check.assignedTo.name || check.assignedTo.email || "",
          kind: check.assignedTo.role === "agent" ? "agent" : "employer",
          isMe: refId(check.assignedTo) === actor.userId,
        }
      : null,
    viewer: viewerFlags({ status: check.status ?? "pending", assignedTo: check.assignedTo }, actor),
  };
}

/**
 * GET /api/background-checks — the background checks of employers the caller
 * works with, and of jobs their agents handle (client report 2026-09-30).
 * Agents run them from /api/background-checks/[id] (owner decision 2026-10-14).
 * An agent can work with many employers, so the list filters by employer, job,
 * check type, holder and status, and searches candidate/employer/job names.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!STAFF_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const requested = parseInt(url.searchParams.get("limit") || "20", 10);
  const limit = PAGE_SIZES.includes(requested) ? requested : 20;

  const actor = staffActor(ctx);
  const scope = await staffCheckFilter(ctx);
  if (scope === "none") return NextResponse.json({ items: [], total: 0, page, limit });

  // Status, type, holder, employer, job and search — always ANDed with the scope.
  const filter = await buildStaffListFilter(scope, url.searchParams, ctx.userId);

  const [items, total] = await Promise.all([
    BackgroundCheck.find(filter)
      .select("status outcome checkType requestedAt completedAt applicationId jobSeekerId jobId employerId references.status assignedTo")
      .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
      .populate({ path: "jobId", select: "title" })
      .populate({ path: "employerId", select: "companyName" })
      .populate({ path: "assignedTo", select: "name email role" })
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BackgroundCheck.countDocuments(filter),
  ]);

  return NextResponse.json({ items: (items as StoredCheck[]).map((c) => toStaffView(c, actor)), total, page, limit });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
