import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { isValidObjectId } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { staffBackgroundCheckActionSchema } from "@/lib/validators/backgroundChecks";
import { actorFromCtx } from "@/lib/audit/log";
import { staffActor, staffCheckFilter } from "@/lib/backgroundChecks/scope";
import { runCheckAction } from "@/lib/backgroundChecks/workflow";
import type { BackgroundCheckAction } from "@/lib/validators/backgroundChecks";
import { recordCheckEvent } from "@/lib/backgroundChecks/history";
import { loadCheckDetail } from "@/lib/backgroundChecks/detail";
import { notifyCompleted } from "@/lib/backgroundChecks/people";
import { Employer } from "@/models/Employer";
import logger from "@/lib/logger";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string }

const STAFF_ROLES: readonly string[] = ["agent", "super_agent", "admin"];

/**
 * The caller's slice of checks, narrowed to one id. A check outside it answers
 * 404 — the same as one that does not exist — so ids cannot be probed.
 */
async function scopedFilter(ctx: AuthCtx, id: string | undefined): Promise<Record<string, unknown> | NextResponse> {
  if (!STAFF_ROLES.includes(ctx.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isValidObjectId(id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const scope = await staffCheckFilter(ctx);
  if (scope === "none") return NextResponse.json({ error: "Not found" }, { status: 404 });
  return scope === "all" ? { _id: id } : { _id: id, ...scope };
}

/**
 * GET /api/background-checks/[id] — one check for the agents who work with
 * its employer: the referees' details and answers (they run the check from
 * them) and its activity history. Never the employer's internal notes.
 */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const filter = await scopedFilter(ctx, params?.id);
  if (filter instanceof NextResponse) return filter;
  const detail = await loadCheckDetail({ filter, actor: staffActor(ctx), includeNotes: false });
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * PATCH /api/background-checks/[id] — an agent starts, records progress on, or
 * completes a check (owner decision 2026-10-14). Assigning, cancelling and the
 * employer's notes stay with the employer.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const filter = await scopedFilter(ctx, params?.id);
  if (filter instanceof NextResponse) return filter;
  if (ctx.role !== "agent") return NextResponse.json({ error: "Only agents run background checks." }, { status: 403 });

  const body = (await validateBody(req, staffBackgroundCheckActionSchema)) as BackgroundCheckAction;
  const { _id: id, ...scope } = filter as { _id: string } & Record<string, unknown>;
  const actor = staffActor(ctx);
  const result = await runCheckAction({ checkId: id, scope, actor, body });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });

  if (result.event) {
    await recordCheckEvent({ checkId: id, event: result.event, actor: actorFromCtx(ctx), req });
  }

  const detail = await loadCheckDetail({ filter, actor, includeNotes: false });
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "complete") {
    const check = detail.check as {
      employerId?: { _id: unknown; companyName?: string } | null;
      jobId?: { title?: string } | null;
      createdBy?: { _id: unknown } | null;
      verifiedBy?: { name?: string; email?: string } | null;
    };
    const owner = (await Employer.findById(check.employerId?._id).select("userId").lean()) as { userId?: unknown } | null;
    notifyCompleted([owner?.userId, check.createdBy?._id], {
      checkId: id,
      actorId: ctx.userId,
      jobTitle: check.jobId?.title ?? "",
      companyName: check.employerId?.companyName ?? "",
      performerName: check.verifiedBy?.name || check.verifiedBy?.email || "",
    }).catch((err) => logger.error({ err, checkId: id }, "[background-checks] completion notice failed"));
  }

  return NextResponse.json(detail);
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
