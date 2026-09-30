import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { getScopedEmployerIds } from "@/lib/auth/agentRestrictions";
import BackgroundCheck from "@/models/BackgroundCheck";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const STAFF_ROLES: readonly string[] = ["agent", "super_agent", "admin"];
const STATUSES: readonly string[] = ["pending", "in_progress", "completed", "cancelled"];
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
}

/**
 * What an agent sees of a check: where it stands and how it came out. The
 * referees' contact details and answers and the employer's own notes stay
 * with the team that runs the check.
 */
function toStaffView(check: StoredCheck) {
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
  };
}

/**
 * GET /api/background-checks — the background checks of employers the caller
 * works with, read-only (client report 2026-09-30). Employers keep running
 * their checks under /api/employer/background-checks.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  if (!STAFF_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const requested = parseInt(url.searchParams.get("limit") || "20", 10);
  const limit = PAGE_SIZES.includes(requested) ? requested : 20;

  // null = admin, no employer filter; [] = sees nothing.
  const employerIds = await getScopedEmployerIds(ctx);
  if (employerIds && employerIds.length === 0) {
    return NextResponse.json({ items: [], total: 0, page, limit });
  }

  const filter: Record<string, unknown> = employerIds ? { employerId: { $in: employerIds } } : {};
  const status = url.searchParams.get("status");
  if (status && STATUSES.includes(status)) filter.status = status;

  const [items, total] = await Promise.all([
    BackgroundCheck.find(filter)
      .select("status outcome checkType requestedAt completedAt applicationId jobSeekerId jobId employerId references.status")
      .populate({ path: "jobSeekerId", select: "fullName userId", populate: { path: "userId", select: "name" } })
      .populate({ path: "jobId", select: "title" })
      .populate({ path: "employerId", select: "companyName" })
      .sort({ requestedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    BackgroundCheck.countDocuments(filter),
  ]);

  return NextResponse.json({ items: (items as StoredCheck[]).map(toStaffView), total, page, limit });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
