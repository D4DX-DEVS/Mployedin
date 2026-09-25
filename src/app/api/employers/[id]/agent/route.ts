import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { Employer } from "@/models/Employer";
import Agent from "@/models/Agent";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { isValidObjectId } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import logger from "@/lib/logger";
import {
  assignEmployerAgent,
  listAssignableAgents,
  resolveEmployerAgents,
} from "@/lib/agents/employerAssignment";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

/**
 * /api/employers/[id]/agent — the agent who looks after an employer.
 * `[id]` is the employer's USER id, like its sibling routes.
 *
 * Admin only. Employers can join from anywhere; which agent runs the account
 * (and so whose targets and invoices it counts toward) is an admin decision.
 */

const bodySchema = z.object({
  /** Agent doc id, or null to leave the employer with no agent. */
  agentId: z.string().refine(isValidObjectId, "Invalid agent id").nullable(),
});

async function loadEmployer(userId: string | undefined) {
  if (!isValidObjectId(userId)) return null;
  return Employer.findOne({ userId }).select("_id agentId companyName").lean<{ _id: unknown; agentId?: unknown; companyName?: string } | null>();
}

/** GET — current agent plus every agent the admin can pick. */
async function getHandler(_req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await connectDB();
  const employer = await loadEmployer(params?.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const [current, agents] = await Promise.all([
    resolveEmployerAgents([employer]).then((m) => m.get(String(employer._id)) ?? null),
    listAssignableAgents(),
  ]);
  return NextResponse.json({ current, agents });
}

/** PATCH { agentId } — put the employer under that agent (null = no agent). */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const { agentId } = await validateBody(req, bodySchema);

  await connectDB();
  const employer = await loadEmployer(params?.id);
  if (!employer) return NextResponse.json({ error: "Employer not found" }, { status: 404 });

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

    // Tell the agent who now runs the account. Best effort — the move stands.
    if (agentId) {
      const agent = await Agent.findById(agentId).select("userId").lean<{ userId: unknown } | null>();
      if (agent?.userId) {
        const { notifyAgentEmployerAssigned } = await import("@/lib/notifications/trigger");
        notifyAgentEmployerAssigned(String(agent.userId), employer.companyName || "A company", String(employer._id))
          .catch((err) => logger.error({ err, employerId: String(employer._id) }, "Failed to notify agent of employer assignment"));
      }
    }
  }

  const current = (await resolveEmployerAgents([{ _id: employer._id, agentId: result.agentId }])).get(String(employer._id)) ?? null;
  return NextResponse.json({ changed: result.changed, current, movedOpenJobs: result.movedOpenJobs });
}

export const GET = withAuth(getHandler, { resource: "employers", action: "update" });
export const PATCH = withAuth(patchHandler, { resource: "employers", action: "update" });
