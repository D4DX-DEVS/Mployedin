/**
 * Agent performance counter utilities.
 * Increment counters in a fire-and-forget fashion after key agent actions.
 */
import Agent from "@/models/Agent";

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
    .catch(() => {});
}
