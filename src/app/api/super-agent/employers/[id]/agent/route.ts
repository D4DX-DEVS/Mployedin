import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import logger from "@/lib/logger";
import {
  assignEmployerAgent,
  listAssignableAgents,
  resolveEmployerAgents,
} from "@/lib/agents/employerAssignment";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * /api/super-agent/employers/[id]/agent — a super agent hands an employer in
 * their book to one of their own agents. `[id]` is the employer's USER id,
 * like the admin route (/api/employers/[id]/agent) this mirrors.
 *
 * A super agent may only move an employer that is unassigned or already with
 * one of their agents — never take one from another team — and only to an
 * agent on their team. Everything else (both link ends, open jobs) is the same
 * `assignEmployerAgent` the admin uses.
 */

const bodySchema = z.object({
  /** Agent doc id on the super agent's team, or null to leave it with no agent. */
  agentId: z.string().refine(isValidObjectId, "Invalid agent id").nullable(),
});

type Access =
  | { ok: true; employer: { _id: unknown; agentId?: unknown; companyName?: string }; teamAgentIds: Set<string> }
  | { ok: false; res: NextResponse };

async function loadAccess(ctx: AuthCtx, employerUserId: string | undefined): Promise<Access> {
  if (ctx.role !== "super_agent") return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (!isValidObjectId(employerUserId)) return { ok: false, res: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };

  await connectDB();
  const [book, employer] = await Promise.all([
    getSuperAgentBook(ctx.userId),
    Employer.findOne({ userId: employerUserId }).select("_id agentId companyName")
      .lean<{ _id: unknown; agentId?: unknown; companyName?: string } | null>(),
  ]);
  if (!book) return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  // Outside the book reads as "not found", like every other super-agent lookup.
  if (!employer || !book.employerIds.map(String).includes(String(employer._id))) {
    return { ok: false, res: NextResponse.json({ error: "Employer not found" }, { status: 404 }) };
  }

  const teamAgentIds = new Set(book.agentIds.map(String));
  const holders = await Agent.find({ assignedEmployerIds: employer._id }).select("_id").lean();
  const currentIds = [
    ...(employer.agentId ? [String(employer.agentId)] : []),
    ...holders.map((a) => String(a._id)),
  ];
  if (currentIds.some((id) => !teamAgentIds.has(id))) {
    return {
      ok: false,
      res: NextResponse.json({ error: "Another team's agent looks after this employer. Ask an admin to move it." }, { status: 403 }),
    };
  }
  return { ok: true, employer, teamAgentIds };
}

/** GET — current agent plus the super agent's own agents to pick from. */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const access = await loadAccess(ctx, params?.id);
  if (!access.ok) return access.res;
  const { employer, teamAgentIds } = access;

  const [current, agents] = await Promise.all([
    resolveEmployerAgents([employer]).then((m) => m.get(String(employer._id)) ?? null),
    listAssignableAgents(),
  ]);
  return NextResponse.json({ current, agents: agents.filter((a) => teamAgentIds.has(a.id)) });
}

/** PATCH { agentId } — put the employer under that team agent (null = no agent). */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  const access = await loadAccess(ctx, params?.id);
  if (!access.ok) return access.res;
  const { employer, teamAgentIds } = access;

  const { agentId } = await validateBody(req, bodySchema);
  if (agentId && !teamAgentIds.has(agentId)) {
    return NextResponse.json({ error: "Pick an agent from your team." }, { status: 400 });
  }

  const result = await assignEmployerAgent(String(employer._id), agentId);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  if (result.changed) {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "employer.assign_agent",
      resource: "employers",
      resourceId: params?.id,
      changes: {
        before: { agentIds: result.previousAgentIds },
        after: { agentId: result.agentId, movedOpenJobs: result.movedOpenJobs },
      },
      req,
    });

    const { notifyEmployerAgentChange } = await import("@/lib/notifications/employerCoverage");
    notifyEmployerAgentChange({
      employerId: String(employer._id),
      companyName: employer.companyName || "A company",
      newAgentId: result.agentId,
      previousAgentIds: result.previousAgentIds,
      assignedBy: "super_agent",
    }).catch((err) => logger.error({ err, employerId: String(employer._id) }, "Failed to notify agents of employer assignment"));
  }

  const current = (await resolveEmployerAgents([{ _id: employer._id, agentId: result.agentId }])).get(String(employer._id)) ?? null;
  return NextResponse.json({ changed: result.changed, current, movedOpenJobs: result.movedOpenJobs });
}

// "read": super agents hold employers create/read only; the team rules above
// are the real gate.
export const GET = withAuth(getHandler, { resource: "employers", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "read" });
