/**
 * Who the AI analytics report is allowed to see.
 *
 * The platform is a hierarchy: an admin hands a super-agent a territory, the
 * super-agent staffs it with agents, and each agent carries a book of
 * employers. Every number an AI report quotes has to stop at the edge of the
 * caller's own branch of that tree — otherwise a super-agent asking "how are we
 * doing?" gets back another territory's revenue, employers and candidate mix.
 *
 * The `scope` field on the request body is NOT this. That one picks the shape
 * of the prompt ("market" analyst JSON vs the markdown analytics report) and is
 * a presentation choice the client is free to make. Data access is resolved
 * here, from the session, and never from the body.
 */
import mongoose from "mongoose";
import { getSuperAgentBook } from "@/lib/auth/agentRestrictions";

export interface ReportScope {
  /**
   * Employer _ids whose jobs, applications and placements the caller may see.
   * `null` means "no employer filter" and is reachable by admins only; an empty
   * array means "see nothing", so a caller that forgets to branch cannot fall
   * through to a platform-wide read.
   */
  employerIds: mongoose.Types.ObjectId[] | null;
  /** Agent _ids in scope. `null` = every agent (admin only). */
  agentIds: mongoose.Types.ObjectId[] | null;
  /**
   * Query fragment bounding Job/Application/Placement to the caller. `null`
   * means no filter and is admin-only; otherwise it matches either the agent
   * who owns the record or the employer it belongs to, since a job posted by an
   * agent on an employer's behalf carries only the agent.
   */
  ownershipMatch: Record<string, unknown> | null;
  /** SuperAgent profile _id, when the caller is a super-agent. */
  superAgentProfileId?: mongoose.Types.ObjectId;
  /** True only for admins — the whole platform. */
  isPlatform: boolean;
  /** Names the coverage in the prompt so the model cannot overstate it. */
  label: string;
}

const DENY: ReportScope = {
  employerIds: [],
  agentIds: [],
  ownershipMatch: { employerId: { $in: [] } },
  isPlatform: false,
  label: "NO DATA — this account has no assigned employers",
};

/**
 * Resolve the data boundary for the signed-in actor. Roles other than
 * admin/super_agent/agent default-deny even though the permission matrix does
 * not currently grant them `reports:read`, so widening the matrix later cannot
 * silently widen the data.
 */
export async function resolveReportScope(ctx: {
  userId: string;
  role: string;
}): Promise<ReportScope> {
  if (ctx.role === "admin") {
    return {
      employerIds: null,
      agentIds: null,
      ownershipMatch: null,
      isPlatform: true,
      label: "THE ENTIRE PLATFORM (all territories)",
    };
  }

  if (ctx.role === "super_agent") {
    const book = await getSuperAgentBook(ctx.userId);
    if (!book) return DENY;
    return {
      employerIds: book.employerIds,
      agentIds: book.agentIds,
      ownershipMatch: book.ownershipMatch,
      superAgentProfileId: book.saProfileId,
      isPlatform: false,
      label: book.agentIds.length === 0
        ? "YOUR TERRITORY (no agents assigned yet)"
        : "YOUR TERRITORY ONLY — the agents you manage and their employers",
    };
  }

  if (ctx.role === "agent") {
    const { default: Agent } = await import("@/models/Agent");
    const { Employer } = await import("@/models/Employer");
    const agent = await Agent.findOne({ userId: ctx.userId })
      .select("_id assignedEmployerIds")
      .lean();
    if (!agent) return DENY;
    const agentId = agent._id as mongoose.Types.ObjectId;
    // An employer reaches an agent two ways: listed on the agent's book, or
    // pointing back at the agent. Counting only one of them under-reports.
    const owned = await Employer.find({ agentId }).select("_id").lean();
    const employerIds = dedupe([
      ...((agent.assignedEmployerIds as mongoose.Types.ObjectId[]) ?? []),
      ...owned.map((e) => e._id as mongoose.Types.ObjectId),
    ]);
    return {
      employerIds,
      agentIds: [agentId],
      ownershipMatch: {
        $or: [
          { agentId },
          ...(employerIds.length > 0 ? [{ employerId: { $in: employerIds } }] : []),
        ],
      },
      isPlatform: false,
      label: "YOUR ASSIGNED EMPLOYERS ONLY",
    };
  }

  return DENY;
}

function dedupe(ids: mongoose.Types.ObjectId[]): mongoose.Types.ObjectId[] {
  const seen = new Set<string>();
  return ids.filter((id) => {
    const key = String(id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
