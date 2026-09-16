/**
 * Agent performance figures.
 *
 * Two things live here, and only one of them may be shown to a user:
 *
 *  - `incrementAgentCounter` maintains the denormalized `Agent.performance`
 *    subdoc. It is fire-and-forget, so a failed write, a record deleted later,
 *    or a seeded document silently puts the counter out of step with reality.
 *  - `getLiveAgentPerformance` counts the collections themselves.
 *
 * Read the live figures for anything a user sees. The subdoc drifted far
 * enough to show three agents holding 7, 6 and 4 placements against a
 * `placements` collection that contained one document in total, on the same
 * dashboard whose headline KPI correctly read zero.
 */
// Type-only: importing the mongoose *value* here would pull its ESM `bson`
// dependency into every module that reaches this file, including server pages
// whose tests mock the models but not the driver.
import type mongoose from "mongoose";
import Agent from "@/models/Agent";
import Lead from "@/models/Lead";
import Job from "@/models/Job";
import Employer from "@/models/Employer";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Placement from "@/models/Placement";
import logger from "@/lib/logger";

type PerformanceField = keyof typeof FIELD_MAP;

const FIELD_MAP = {
  leadsGenerated: "performance.leadsGenerated",
  employersCreated: "performance.employersCreated",
  vacanciesPosted: "performance.vacanciesPosted",
  jobSeekersSubmitted: "performance.jobSeekersSubmitted",
  interviewsScheduled: "performance.interviewsScheduled",
  placementsCompleted: "performance.placementsCompleted",
} as const;

/**
 * Increment a performance counter on the Agent document.
 * Accepts either the Agent doc _id or the agent's userId.
 * Non-blocking — errors are silently swallowed.
 */
export function incrementAgentCounter(
  agentIdentifier: string,
  field: PerformanceField,
  options?: { byUserId?: boolean }
) {
  const filter = options?.byUserId
    ? { userId: agentIdentifier }
    : { _id: agentIdentifier };

  Agent.findOneAndUpdate(filter, { $inc: { [FIELD_MAP[field]]: 1 } })
    .exec()
    .catch((err) => logger.error({ err, agentIdentifier }, "Failed to increment agent performance counter"));
}

/** The six figures the agent scorecards render, all counted from source. */
export interface LiveAgentPerformance {
  leadsGenerated: number;
  employersCreated: number;
  vacanciesPosted: number;
  jobSeekersSubmitted: number;
  interviewsScheduled: number;
  placementsCompleted: number;
}

export const EMPTY_AGENT_PERFORMANCE: LiveAgentPerformance = {
  leadsGenerated: 0,
  employersCreated: 0,
  vacanciesPosted: 0,
  jobSeekersSubmitted: 0,
  interviewsScheduled: 0,
  placementsCompleted: 0,
};

/** One `$group` per collection, keyed by the Agent doc _id every model stores. */
async function countByAgent(
  model: mongoose.Model<never>,
  agentDocIds: mongoose.Types.ObjectId[],
): Promise<Map<string, number>> {
  const rows = await model.aggregate<{ _id: mongoose.Types.ObjectId; count: number }>([
    { $match: { agentId: { $in: agentDocIds } } },
    { $group: { _id: "$agentId", count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/**
 * Live performance figures for a set of agents, keyed by Agent doc _id.
 *
 * Every model here stores `agentId` as the Agent document's `_id` (not the
 * agent's User id) — the same shape `incrementAgentCounter` is called with.
 * Agents with no activity are present in the map with zeroes, so a caller
 * never has to decide whether a missing key means "none" or "unknown".
 *
 * Takes ObjectIds, not strings: `$match` does no casting, so a string id
 * would match nothing and report a confident zero for an agent with work.
 * The type keeps that mistake a compile error rather than a silent wrong
 * number on a dashboard.
 */
export async function getLiveAgentPerformance(
  ids: mongoose.Types.ObjectId[],
): Promise<Map<string, LiveAgentPerformance>> {
  const result = new Map<string, LiveAgentPerformance>();
  if (ids.length === 0) return result;

  const [leads, employers, jobs, applications, interviews, placements] = await Promise.all([
    countByAgent(Lead as unknown as mongoose.Model<never>, ids),
    countByAgent(Employer as unknown as mongoose.Model<never>, ids),
    countByAgent(Job as unknown as mongoose.Model<never>, ids),
    countByAgent(Application as unknown as mongoose.Model<never>, ids),
    countByAgent(Interview as unknown as mongoose.Model<never>, ids),
    countByAgent(Placement as unknown as mongoose.Model<never>, ids),
  ]);

  for (const id of ids) {
    const key = String(id);
    result.set(key, {
      leadsGenerated: leads.get(key) ?? 0,
      employersCreated: employers.get(key) ?? 0,
      vacanciesPosted: jobs.get(key) ?? 0,
      jobSeekersSubmitted: applications.get(key) ?? 0,
      interviewsScheduled: interviews.get(key) ?? 0,
      placementsCompleted: placements.get(key) ?? 0,
    });
  }
  return result;
}
