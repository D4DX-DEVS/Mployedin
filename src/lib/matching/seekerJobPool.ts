/**
 * The jobs a seeker's feed scores, and the profile it scores them with.
 *
 * One loader for the home feed (`/api/jobs/recommended`) and the background
 * warm-up that runs after a profile save (`seekerMatchWarm`). They must load
 * the same profile and the same pool: the stored Jev verdicts are keyed by
 * that exact input, so a warm-up that read a different profile would pay for
 * verdicts the page never finds.
 */
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { SEEKER_MATCH_FIELDS } from "@/lib/matchScore";
import { effectiveSeekerProfile } from "@/lib/effectiveSeekerProfile";
import {
  buildRecommendedJobQuery,
  poolCountries,
  RECOMMENDATION_POOL_SIZE,
  RECOMMENDED_JOB_SELECT,
} from "@/lib/jobRecommendations";
import { restrictToIds, vectorRetrievalEnabled, vectorRetrieveJobs } from "@/lib/matching/vectorRetrieval";

export const POOL_SIZE = RECOMMENDATION_POOL_SIZE;

/**
 * Null when the user has no seeker profile. Expects an open DB connection.
 * Return type inferred so the job rows keep their lean-document shape.
 */
export async function loadSeekerJobPool(userId: string, poolPage = 1) {
  const seeker = await JobSeeker.findOne({ userId }).select(SEEKER_MATCH_FIELDS).lean();
  if (!seeker) return null;

  // Effective profile (base + confirmed skills) — shared with the dashboard
  // surfaces so every page shows the same percentage for the same job.
  const seekerProfile = await effectiveSeekerProfile(userId, seeker);

  // Exclude already-applied jobs — withdrawn applications don't count, since
  // the apply endpoints allow re-applying after a withdrawal.
  const seekerId = (seeker as unknown as { _id: unknown })._id;
  const appliedJobIds = await Application.find({ jobSeekerId: seekerId, status: { $ne: "withdrawn" } })
    .select("jobId")
    .lean()
    .then((apps) => apps.map((a) => a.jobId));

  // Candidate filter — shared with the seeker home page so both surfaces
  // start from the same pool (live, unexpired, not applied to, in a preferred
  // country or remote).
  const jobQuery = buildRecommendedJobQuery({
    preferredCountries: poolCountries(seeker),
    excludeJobIds: appliedJobIds,
  });

  // Total matching jobs count (for pool page calculation)
  const totalMatchingJobs = await Job.countDocuments(jobQuery);

  // More matching jobs than one pool holds: start from the ones nearest the
  // seeker's vector instead of the newest. Three pools' worth of ids, because
  // the vector filter knows only status and jobQuery still drops some (country,
  // expiry, applied). One pool then, so pool_page stays 1.
  const vectorIds =
    poolPage === 1 && totalMatchingJobs > POOL_SIZE && vectorRetrievalEnabled()
      ? await vectorRetrieveJobs(String(seekerId), POOL_SIZE * 3)
      : null;

  // Candidate pool — fetch the current pool page slice
  const poolSkip = vectorIds ? 0 : (poolPage - 1) * POOL_SIZE;
  const candidateJobs = await Job.find(vectorIds ? restrictToIds(jobQuery, vectorIds) : jobQuery)
    // _id tiebreaker: jobs seeded in the same second otherwise get an arbitrary
    // order per query, so skip/limit windows shift and the same job can land in
    // two pool pages (duplicate React keys downstream).
    .sort({ createdAt: -1, _id: -1 })
    .skip(poolSkip)
    .limit(POOL_SIZE)
    .select(RECOMMENDED_JOB_SELECT)
    .populate("employerId", "companyName logo")
    .lean();

  return {
    seekerProfile,
    candidateJobs,
    /** Every job the candidate filter matches, across all pool pages. */
    totalMatchingJobs,
    /** The pool came from vector retrieval: it is the only pool page. */
    retrievedByVector: vectorIds !== null,
  };
}

export type SeekerJobPool = NonNullable<Awaited<ReturnType<typeof loadSeekerJobPool>>>;
