/**
 * Effective matching-weights resolution for AI candidate scoring.
 *
 * The employer configures scoring priorities on /employer/matching-weights
 * (persisted to Employer.matchingWeights) and can override per-job
 * (Job.matchingWeights). Both AI screening paths — auto-screen on apply and the
 * manual "Screen with AI" — must feed these weights into the LLM prompt so the
 * saved preferences actually change candidate scores instead of being a no-op.
 */

import type { Types } from "mongoose";

export interface MatchingWeights {
  skills: number;
  experience: number;
  education: number;
  industryExperience: number;
  preferredQualifications: number;
}

export const DEFAULT_WEIGHTS: MatchingWeights = {
  skills: 40,
  experience: 30,
  education: 15,
  industryExperience: 10,
  preferredQualifications: 5,
};

const WEIGHT_LABELS: Record<keyof MatchingWeights, string> = {
  skills: "Required skills match",
  experience: "Relevant experience (depth and relevance to this role, not raw years)",
  education: "Education & certifications",
  industryExperience: "Role / industry experience",
  preferredQualifications: "Preferred (nice-to-have) qualifications",
};

function coerce(raw: unknown): MatchingWeights | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const keys = Object.keys(DEFAULT_WEIGHTS) as (keyof MatchingWeights)[];
  const out = {} as MatchingWeights;
  let any = false;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
      any = true;
    } else {
      out[k] = DEFAULT_WEIGHTS[k];
    }
  }
  if (!any) return null;
  // Legacy 8-key docs lose their dropped keys here, so the survivors may not
  // total 100 — rescale proportionally so percentages stay meaningful.
  const total = keys.reduce((sum, k) => sum + out[k], 0);
  if (total > 0 && total !== 100) {
    for (const k of keys) out[k] = Math.round((out[k] / total) * 100);
    // Rounding can drift ±1-2; dump the remainder on the largest weight so
    // the UI's exact-100 check still passes.
    const drift = 100 - keys.reduce((sum, k) => sum + out[k], 0);
    if (drift !== 0) {
      const largest = keys.reduce((a, b) => (out[b] > out[a] ? b : a));
      out[largest] += drift;
    }
  }
  return out;
}

/**
 * Normalize a raw (possibly legacy 8-key) weights document into the current
 * 5-key model, falling back to platform defaults. Use at every API boundary
 * that returns stored weights to the client.
 */
export function sanitizeMatchingWeights(raw: unknown): MatchingWeights {
  return coerce(raw) ?? { ...DEFAULT_WEIGHTS };
}

/**
 * Resolve the weights that apply to a job: per-job override wins, else the
 * employer default, else the platform default. Accepts already-loaded values to
 * avoid an extra query when the caller already has the job/employer in hand.
 */
export async function resolveJobMatchingWeights(input: {
  jobId?: string | Types.ObjectId;
  jobWeights?: unknown;
  employerId?: string | Types.ObjectId;
}): Promise<MatchingWeights> {
  const fromJob = coerce(input.jobWeights);
  if (fromJob) return fromJob;

  // Lazy-load the Mongoose models so importing the pure helpers
  // (formatWeightsForPrompt/DEFAULT_WEIGHTS) never pulls in the DB layer.
  const { default: Job } = await import("@/models/Job");
  const { default: Employer } = await import("@/models/Employer");

  let employerId = input.employerId;
  if (!employerId && input.jobId) {
    const job = await Job.findById(input.jobId).select("matchingWeights employerId").lean();
    const jobWeights = coerce((job as { matchingWeights?: unknown } | null)?.matchingWeights);
    if (jobWeights) return jobWeights;
    employerId = (job as { employerId?: Types.ObjectId } | null)?.employerId;
  }

  if (employerId) {
    const employer = await Employer.findById(employerId).select("matchingWeights").lean();
    const fromEmployer = coerce((employer as { matchingWeights?: unknown } | null)?.matchingWeights);
    if (fromEmployer) return fromEmployer;
  }

  return DEFAULT_WEIGHTS;
}

/**
 * Render the weights as a prompt-ready "Scoring criteria" block. Zero-weight
 * signals are omitted so the model isn't told to score something the employer
 * turned off.
 */
export function formatWeightsForPrompt(weights: MatchingWeights): string {
  const keys = Object.keys(weights) as (keyof MatchingWeights)[];
  const lines = keys
    .filter((k) => weights[k] > 0)
    .sort((a, b) => weights[b] - weights[a])
    .map((k) => `- ${WEIGHT_LABELS[k]}: ${weights[k]}%`);
  return lines.join("\n");
}
