import { NextRequest, NextResponse } from "next/server";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import BackgroundCheck from "@/models/BackgroundCheck";
import { validateBody } from "@/lib/validators";
import { backgroundCheckActionSchema } from "@/lib/validators/backgroundChecks";
import { actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { runCheckAction, type CheckActor } from "@/lib/backgroundChecks/workflow";
import { recordCheckEvent } from "@/lib/backgroundChecks/history";
import { loadCheckDetail, type CheckDetail } from "@/lib/backgroundChecks/detail";
import { assignablePeople, notifyAssignee, notifyCompleted } from "@/lib/backgroundChecks/people";
import logger from "@/lib/logger";

interface EmployerDoc { _id: unknown; userId: unknown; agentId?: unknown; companyName?: string }

/**
 * The real person behind the request. ctx.userId is the company owner even
 * when a colleague (ctx.member) or a staff member in tenant view is calling.
 */
function employerActor(ctx: AuthContext): CheckActor {
  return {
    userId: ctx.tenantView?.actorId ?? ctx.member?.actorId ?? ctx.userId,
    side: "employer",
    canManage: !ctx.member || ctx.member.permissions.canManageTeam === true,
    // The route itself is gated on canRunScreening for colleagues.
    canPerform: true,
  };
}

type Scope = { ok: false; error: NextResponse } | { ok: true; emp: EmployerDoc; jobId: unknown; id: string };

async function loadScope(ctx: AuthContext, id: string | undefined): Promise<Scope> {
  if (!isValidObjectId(id)) return { ok: false, error: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };
  await connectDB();
  const emp = (await Employer.findOne({ userId: ctx.userId }).select("_id userId agentId companyName").lean()) as EmployerDoc | null;
  if (!emp) return { ok: false, error: NextResponse.json({ error: "Employer profile not found" }, { status: 404 }) };
  const stub = (await BackgroundCheck.findOne({ _id: id, employerId: emp._id }).select("jobId").lean()) as { jobId?: unknown } | null;
  if (!stub) return { ok: false, error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { ok: true, emp, jobId: stub.jobId, id: id as string };
}

async function detailFor(id: string, emp: EmployerDoc, jobId: unknown, actor: CheckActor): Promise<CheckDetail | null> {
  const people = actor.canManage ? await assignablePeople(emp, jobId) : [];
  return loadCheckDetail({ filter: { _id: id, employerId: emp._id }, actor, includeNotes: true, assignable: people });
}

/**
 * GET /api/employer/background-checks/[id] — one check with its activity
 * history, who may be handed it, and what this viewer may do with it.
 */
async function getHandler(_req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const scope = await loadScope(ctx, params?.id);
  if (!scope.ok) return scope.error;
  const detail = await detailFor(scope.id, scope.emp, scope.jobId, employerActor(ctx));
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/**
 * PATCH /api/employer/background-checks/[id] — one action on the check
 * (start, progress, complete, assign, cancel, notes). The rules for each live
 * in src/lib/backgroundChecks/workflow.ts and are shared with the agent route.
 */
async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const scope = await loadScope(ctx, params?.id);
  if (!scope.ok) return scope.error;
  const { emp, jobId, id } = scope;
  const actor = employerActor(ctx);
  const body = await validateBody(req, backgroundCheckActionSchema);

  const people = body.action === "assign" ? await assignablePeople(emp, jobId) : [];
  const result = await runCheckAction({
    checkId: id,
    scope: { employerId: emp._id },
    actor,
    body,
    assignable: async () => new Set(people.map((p) => p._id)),
  });
  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });

  if (result.event) {
    await recordCheckEvent({ checkId: id, event: result.event, actor: actorFromCtx(ctx), req });
  }

  const detail = await detailFor(id, emp, jobId, actor);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const check = detail.check as {
    jobId?: { title?: string } | null;
    createdBy?: { _id: unknown } | null;
    verifiedBy?: { name?: string; email?: string } | null;
  };
  const notice = { checkId: id, actorId: actor.userId, jobTitle: check.jobId?.title ?? "", companyName: emp.companyName ?? "" };
  if (body.action === "assign" && body.assignedTo && result.event) {
    const person = people.find((p) => p._id === body.assignedTo);
    if (person) {
      notifyAssignee(person, notice).catch((err) => logger.error({ err, checkId: id }, "[background-checks] assign notice failed"));
    }
  }
  if (body.action === "complete") {
    const performerName = check.verifiedBy?.name || check.verifiedBy?.email || "";
    notifyCompleted([emp.userId, check.createdBy?._id], { ...notice, performerName })
      .catch((err) => logger.error({ err, checkId: id }, "[background-checks] completion notice failed"));
  }

  return NextResponse.json(detail);
}

export const GET = withAuth(getHandler, { resource: "applications", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "applications", action: "update" });
