/**
 * Smart auto-assignment: picks the best available agent for a job
 * Scoring: geographic match > workload (fewer active jobs) > performance
 */
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import type { Types } from "mongoose";

interface AgentCandidate {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  assignedCityIds: Types.ObjectId[];
  assignedEmployerIds: Types.ObjectId[];
  performance: {
    placementsCompleted: number;
    jobSeekersSubmitted: number;
  };
}

interface AutoAssignOptions {
  /** Employer's ObjectId */
  employerId: string;
  /** Job location city (for geo-matching) */
  jobCity?: string;
}

/**
 * Find the best agent to assign to a job.
 * Returns agent._id or null if no agents are available.
 */
export async function autoAssignAgent(
  options: AutoAssignOptions
): Promise<string | null> {
  await connectDB();

  // Find agents assigned to this employer
  const agents = (await Agent.find({
    assignedEmployerIds: options.employerId,
  })
    .select("_id userId assignedCityIds assignedEmployerIds performance")
    .lean()) as AgentCandidate[];

  if (agents.length === 0) return null;
  if (agents.length === 1) return String(agents[0]._id);

  // Get active job counts per agent for workload scoring
  const agentIds = agents.map((a) => a._id);
  const jobCounts = await Job.aggregate([
    {
      $match: {
        agentId: { $in: agentIds },
        status: { $in: ["draft", "active", "pending_approval"] },
      },
    },
    { $group: { _id: "$agentId", count: { $sum: 1 } } },
  ]);
  const workloadMap = new Map<string, number>(
    jobCounts.map((j: { _id: Types.ObjectId; count: number }) => [
      String(j._id),
      j.count,
    ])
  );

  // Score each agent
  const scored = agents.map((agent) => {
    let score = 0;

    // Workload: fewer active jobs = higher score (max 40 pts)
    const activeJobs = workloadMap.get(String(agent._id)) ?? 0;
    score += Math.max(0, 40 - activeJobs * 5);

    // Performance: placement rate (max 40 pts)
    const submitted = agent.performance?.jobSeekersSubmitted ?? 0;
    const placed = agent.performance?.placementsCompleted ?? 0;
    const placementRate = submitted > 0 ? placed / submitted : 0;
    score += Math.round(placementRate * 40);

    // Geographic bonus (20 pts) — simplified: check assignedCityIds count as proxy
    const cityCount = agent.assignedCityIds?.length ?? 0;
    score += Math.min(20, cityCount * 5);

    return { agentId: String(agent._id), score };
  });

  // Sort by score descending, pick the best
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.agentId ?? null;
}
