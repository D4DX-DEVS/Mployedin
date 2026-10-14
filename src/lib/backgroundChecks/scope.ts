import mongoose from "mongoose";
import { getScopedEmployerIds, getSuperAgentBook } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import type { CheckActor } from "./workflow";

interface StaffCtx { userId: string; role: string }

/**
 * Which checks a staff member may see: every check of an employer in their
 * scope, plus every check on a job one of their agents handles
 * (`Job.agentId`) — the job's agent may differ from the employer's own agent
 * (QA EMP-002, 2026-10-06). Admins see everything; an empty scope sees nothing.
 */
export async function staffCheckFilter(ctx: StaffCtx): Promise<Record<string, unknown> | "all" | "none"> {
  if (ctx.role === "admin") return "all";

  let employerIds: mongoose.Types.ObjectId[];
  let agentIds: unknown[];
  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    employerIds = book?.employerIds ?? [];
    agentIds = book?.agentIds ?? [];
  } else if (ctx.role === "agent") {
    const [scoped, agent] = await Promise.all([
      getScopedEmployerIds(ctx),
      Agent.findOne({ userId: ctx.userId }).select("_id").lean(),
    ]);
    employerIds = scoped ?? [];
    agentIds = agent ? [agent._id] : [];
  } else {
    return "none";
  }

  const jobIds = agentIds.length > 0 ? await Job.distinct("_id", { agentId: { $in: agentIds } }) : [];
  const clauses: Record<string, unknown>[] = [];
  if (employerIds.length > 0) clauses.push({ employerId: { $in: employerIds } });
  if (jobIds.length > 0) clauses.push({ jobId: { $in: jobIds } });
  if (clauses.length === 0) return "none";
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

/** Staff run checks only as agents; super agents and admins follow them. */
export function staffActor(ctx: StaffCtx): CheckActor {
  return { userId: ctx.userId, side: "staff", canManage: false, canPerform: ctx.role === "agent" };
}
