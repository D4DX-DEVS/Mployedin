/**
 * Job lifecycle stamps used by agent targets (lib/targets/kpiCalculator).
 *
 * - `firstPublishedAt` / `acquiredByAgentId`: set the first time a job goes
 *   live and never again. Reassigning the employer later moves open jobs to the
 *   new agent (lib/agents/employerAssignment), so the acquisition credit has to
 *   be frozen here or past months would change.
 * - `closedAt`: the latest close. A hire on the job counts as a conversion only
 *   once the job is closed.
 *
 * Runs from Job's pre-save hook. Paths that close jobs with `updateMany` set
 * `closedAt` themselves.
 */

import type mongoose from "mongoose";

export interface LifecycleJob {
  isNew: boolean;
  status: string;
  employerId?: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  firstPublishedAt?: Date;
  acquiredByAgentId?: mongoose.Types.ObjectId;
  closedAt?: Date;
  isModified(path: string): boolean;
}

/** Resolves the employer's agent when the job carries none. Injectable for tests. */
export type EmployerAgentLookup = (employerId: mongoose.Types.ObjectId) => Promise<mongoose.Types.ObjectId | null>;

async function defaultEmployerAgent(employerId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId | null> {
  const { default: Employer } = await import("@/models/Employer");
  const employer = (await Employer.findById(employerId).select("agentId").lean()) as { agentId?: mongoose.Types.ObjectId } | null;
  return employer?.agentId ?? null;
}

export async function stampJobLifecycle(
  job: LifecycleJob,
  now: Date = new Date(),
  employerAgent: EmployerAgentLookup = defaultEmployerAgent,
): Promise<void> {
  if (job.status === "active" && !job.firstPublishedAt) {
    job.firstPublishedAt = now;
    if (!job.acquiredByAgentId) {
      let agentId = job.agentId ?? null;
      if (!agentId && job.employerId) {
        try {
          agentId = await employerAgent(job.employerId);
        } catch {
          agentId = null; // a lookup failure must never block publishing
        }
      }
      if (agentId) job.acquiredByAgentId = agentId;
    }
  }

  if (job.status === "closed" && (job.isNew || job.isModified("status"))) {
    job.closedAt = now;
  }
}
