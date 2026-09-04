import Agent from "@/models/Agent";
import AgentTask from "@/models/AgentTask";
import Lead from "@/models/Lead";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import Application from "@/models/Application";
import Job from "@/models/Job";
import type mongoose from "mongoose";

/**
 * What is waiting on an agent, as counts and as rows.
 *
 * The agent dashboard and the nav badges both need this and used to have no
 * shared way to ask: the dashboard computed portfolio metrics inline, the nav
 * had no counts at all, and "overdue" existed only as a client-side comparison
 * inside whichever list page happened to be open. One module now, so a badge
 * and the queue it links to can never disagree.
 */

export interface AgentScope {
  agentId: mongoose.Types.ObjectId;
  assignedEmployerIds: mongoose.Types.ObjectId[];
  /** Jobs owned directly or through an assigned employer. */
  portfolioJobIds: mongoose.Types.ObjectId[];
  userId: string;
}

export interface AgentActionCounts {
  overdueTasks: number;
  dueFollowUps: number;
  interviewsAwaitingOutcome: number;
  offersAwaitingResponse: number;
  newCandidates: number;
}

export const EMPTY_AGENT_COUNTS: AgentActionCounts = {
  overdueTasks: 0,
  dueFollowUps: 0,
  interviewsAwaitingOutcome: 0,
  offersAwaitingResponse: 0,
  newCandidates: 0,
};

/** The kinds of work the queue can surface, in the order they outrank each other. */
export type AgentQueueKind =
  | "followUp"
  | "task"
  | "interviewOutcome"
  | "offerResponse"
  | "newCandidate";

export interface AgentQueueItem {
  kind: AgentQueueKind;
  /** Stable per-row id, for React keys. */
  id: string;
  /** The record's own name — a company, a task title, a candidate. */
  subject: string;
  /** Whole days past the moment this became actionable; 0 when it is due today. */
  daysLate: number;
  /** Path (no locale prefix) to the filtered list this row belongs to. */
  href: string;
}

/** Resolves the agent's own id and the jobs in their portfolio. */
export async function resolveAgentScope(userId: string): Promise<AgentScope | null> {
  const agent = await Agent.findOne({ userId }).select("_id assignedEmployerIds").lean();
  if (!agent) return null;

  const agentId = (agent as Record<string, unknown>)._id as mongoose.Types.ObjectId;
  const assignedEmployerIds =
    ((agent as Record<string, unknown>).assignedEmployerIds as mongoose.Types.ObjectId[] | undefined) ??
    [];

  // Same portfolio definition the dashboard has always used: a job is the
  // agent's if they own it, or if it belongs to an employer assigned to them.
  const jobFilter = {
    $or: [
      { agentId },
      ...(assignedEmployerIds.length ? [{ employerId: { $in: assignedEmployerIds } }] : []),
    ],
  };
  const portfolioJobIds = (await Job.find(jobFilter).select("_id").lean()).map(
    (j) => j._id as mongoose.Types.ObjectId,
  );

  return { agentId, assignedEmployerIds, portfolioJobIds, userId };
}

export async function getAgentActionCounts(scope: AgentScope): Promise<AgentActionCounts> {
  const now = new Date();
  const { agentId, assignedEmployerIds, portfolioJobIds, userId } = scope;

  const [overdueTasks, dueFollowUps, interviewsAwaitingOutcome, offersAwaitingResponse, newCandidates] =
    await Promise.all([
      AgentTask.countDocuments({
        userId,
        dueDate: { $ne: null, $lt: now },
        status: { $ne: "completed" },
      }),
      Lead.countDocuments({
        agentId,
        followUpAt: { $ne: null, $lte: now },
        status: { $nin: ["converted", "lost"] },
      }),
      portfolioJobIds.length
        ? Interview.countDocuments({
            jobId: { $in: portfolioJobIds },
            scheduledAt: { $lt: now },
            outcome: { $in: [null, ""] },
            status: { $nin: ["cancelled", "rescheduled"] },
          })
        : 0,
      // Offers carry no agentId, so they scope through the assigned employers.
      assignedEmployerIds.length
        ? Offer.countDocuments({ employerId: { $in: assignedEmployerIds }, status: "pending" })
        : 0,
      portfolioJobIds.length
        ? Application.countDocuments({ jobId: { $in: portfolioJobIds }, status: "applied" })
        : 0,
    ]);

  return {
    overdueTasks,
    dueFollowUps,
    interviewsAwaitingOutcome,
    offersAwaitingResponse,
    newCandidates,
  };
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

/**
 * The rows for the dashboard queue, most overdue first.
 *
 * Only the four kinds that name a specific record appear here — "12 new
 * candidates" is a count, not a row, so it stays in the summary strip.
 */
export async function getAgentQueueItems(scope: AgentScope, limit = 6): Promise<AgentQueueItem[]> {
  const now = new Date();
  const { agentId, assignedEmployerIds, portfolioJobIds, userId } = scope;

  const [leads, tasks, interviews, offers] = await Promise.all([
    Lead.find({
      agentId,
      followUpAt: { $ne: null, $lte: now },
      status: { $nin: ["converted", "lost"] },
    })
      .select("_id companyName followUpAt")
      .sort({ followUpAt: 1 })
      .limit(limit)
      .lean(),
    AgentTask.find({ userId, dueDate: { $ne: null, $lt: now }, status: { $ne: "completed" } })
      .select("_id title dueDate")
      .sort({ dueDate: 1 })
      .limit(limit)
      .lean(),
    portfolioJobIds.length
      ? Interview.find({
          jobId: { $in: portfolioJobIds },
          scheduledAt: { $lt: now },
          outcome: { $in: [null, ""] },
          status: { $nin: ["cancelled", "rescheduled"] },
        })
          .select("_id scheduledAt jobSeekerId")
          .populate("jobSeekerId", "fullName")
          .sort({ scheduledAt: 1 })
          .limit(limit)
          .lean()
      : [],
    assignedEmployerIds.length
      ? Offer.find({ employerId: { $in: assignedEmployerIds }, status: "pending" })
          .select("_id candidateName createdAt expiresAt")
          .sort({ expiresAt: 1, createdAt: 1 })
          .limit(limit)
          .lean()
      : [],
  ]);

  const items: AgentQueueItem[] = [
    ...leads.map((l) => ({
      kind: "followUp" as const,
      id: String(l._id),
      subject: String((l as Record<string, unknown>).companyName ?? ""),
      daysLate: daysBetween(new Date(String((l as Record<string, unknown>).followUpAt)), now),
      href: "/agent/leads?followUp=due",
    })),
    // AgentTask is a typed model, so these fields need no cast.
    ...tasks.map((t) => ({
      kind: "task" as const,
      id: String(t._id),
      subject: t.title ?? "",
      daysLate: daysBetween(new Date(String(t.dueDate)), now),
      href: "/agent/tasks?due=overdue",
    })),
    ...interviews.map((iv) => {
      const row = iv as Record<string, unknown>;
      const seeker = row.jobSeekerId as { fullName?: string } | undefined;
      return {
        kind: "interviewOutcome" as const,
        id: String(row._id),
        subject: seeker?.fullName ?? "",
        daysLate: daysBetween(new Date(String(row.scheduledAt)), now),
        href: "/agent/interviews?outcome=pending",
      };
    }),
    ...offers.map((o) => {
      const row = o as Record<string, unknown>;
      return {
        kind: "offerResponse" as const,
        id: String(row._id),
        subject: String(row.candidateName ?? ""),
        daysLate: daysBetween(new Date(String(row.expiresAt ?? row.createdAt)), now),
        href: "/agent/offers?status=pending",
      };
    }),
  ];

  // Most overdue first. A tie falls back to the kind order above, which puts a
  // cooling lead ahead of an unlogged interview outcome on the same day.
  const kindRank: Record<AgentQueueKind, number> = {
    followUp: 0,
    task: 1,
    interviewOutcome: 2,
    offerResponse: 3,
    newCandidate: 4,
  };
  return items
    .sort((a, b) => b.daysLate - a.daysLate || kindRank[a.kind] - kindRank[b.kind])
    .slice(0, limit);
}
