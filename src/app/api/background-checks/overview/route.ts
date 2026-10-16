import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import BackgroundCheck from "@/models/BackgroundCheck";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import { staffCheckFilter } from "@/lib/backgroundChecks/scope";
import { awaitingReplyClause } from "@/lib/backgroundChecks/listFilters";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const STAFF_ROLES: readonly string[] = ["agent", "super_agent", "admin"];
/** Plenty for a picker; an admin's whole book is searched in the picker itself. */
const OPTION_CAP = 500;

interface CountRow { _id: unknown; total: number; open: number }
interface JobRow extends CountRow { employerId: unknown }

const EMPTY = {
  counts: { pending: 0, in_progress: 0, awaiting_reply: 0, mine: 0, completed: 0 },
  employers: [] as unknown[],
  jobs: [] as unknown[],
};

/**
 * GET /api/background-checks/overview — what an agent needs to find their way
 * through checks for many employers: counts for the summary tiles, and the
 * employers and jobs that actually have checks (for the Employer → Job
 * filters). Same scope as the list; nothing outside it is counted or named.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx) {
  if (!STAFF_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await connectDB();

  const canRun = ctx.role === "agent";
  const scope = await staffCheckFilter(ctx);
  if (scope === "none") return NextResponse.json({ ...EMPTY, canRun });
  const match = scope === "all" ? {} : scope;
  const me = new mongoose.Types.ObjectId(ctx.userId);
  const openExpr = { $cond: [{ $in: ["$status", ["pending", "in_progress"]] }, 1, 0] };

  const [facets] = await BackgroundCheck.aggregate<{
    pending: { n: number }[];
    in_progress: { n: number }[];
    awaiting_reply: { n: number }[];
    mine: { n: number }[];
    completed: { n: number }[];
    employers: CountRow[];
    jobs: JobRow[];
  }>([
    { $match: match },
    {
      $facet: {
        pending: [{ $match: { status: "pending" } }, { $count: "n" }],
        in_progress: [{ $match: { status: "in_progress" } }, { $count: "n" }],
        awaiting_reply: [{ $match: awaitingReplyClause() }, { $count: "n" }],
        mine: [{ $match: { assignedTo: me, status: { $in: ["pending", "in_progress"] } } }, { $count: "n" }],
        completed: [{ $match: { status: "completed" } }, { $count: "n" }],
        employers: [
          { $group: { _id: "$employerId", total: { $sum: 1 }, open: { $sum: openExpr } } },
          { $sort: { open: -1, total: -1 } },
          { $limit: OPTION_CAP },
        ],
        jobs: [
          { $group: { _id: "$jobId", employerId: { $first: "$employerId" }, total: { $sum: 1 }, open: { $sum: openExpr } } },
          { $sort: { open: -1, total: -1 } },
          { $limit: OPTION_CAP },
        ],
      },
    },
  ]);

  const count = (rows?: { n: number }[]) => rows?.[0]?.n ?? 0;
  const employerRows = facets?.employers ?? [];
  const jobRows = facets?.jobs ?? [];

  const [employerDocs, jobDocs] = await Promise.all([
    employerRows.length
      ? Employer.find({ _id: { $in: employerRows.map((r) => r._id) } }).select("companyName").lean()
      : [],
    jobRows.length ? Job.find({ _id: { $in: jobRows.map((r) => r._id) } }).select("title").lean() : [],
  ]);
  const employerName = new Map(employerDocs.map((e) => [String(e._id), (e as { companyName?: string }).companyName ?? ""]));
  const jobTitle = new Map(jobDocs.map((j) => [String(j._id), (j as { title?: string }).title ?? ""]));

  return NextResponse.json({
    canRun,
    counts: {
      pending: count(facets?.pending),
      in_progress: count(facets?.in_progress),
      awaiting_reply: count(facets?.awaiting_reply),
      mine: canRun ? count(facets?.mine) : 0,
      completed: count(facets?.completed),
    },
    employers: employerRows
      .filter((r) => r._id)
      .map((r) => ({ _id: String(r._id), name: employerName.get(String(r._id)) ?? "", total: r.total, open: r.open })),
    jobs: jobRows
      .filter((r) => r._id)
      .map((r) => ({
        _id: String(r._id),
        employerId: r.employerId ? String(r.employerId) : "",
        title: jobTitle.get(String(r._id)) ?? "",
        total: r.total,
        open: r.open,
      })),
  });
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
