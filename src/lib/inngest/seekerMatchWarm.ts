/**
 * Score a seeker's home feed after a profile save, off the request path.
 *
 * Runs the same load and scoring as `/api/jobs/recommended` in "cached" mode,
 * which queues the missing Jev verdicts to `jev-fill` (same request, same
 * event id, so a page view that already queued them adds nothing).
 */
import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import { loadSeekerJobPool } from "@/lib/matching/seekerJobPool";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";
import { SEEKER_MATCH_WARM_EVENT } from "@/lib/matching/seekerMatchWarmQueue";

export const seekerMatchWarmFunction = inngest.createFunction(
  {
    id: "seeker-match-warm",
    name: "Warm seeker match scores",
    retries: 1,
    // Onboarding saves several times and the CV reader fills sections after
    // it: wait for the profile to settle, then score the final version once.
    debounce: { key: "event.data.userId", period: "20s" },
    concurrency: [{ limit: 2 }],
    triggers: [{ event: SEEKER_MATCH_WARM_EVENT }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { userId: string } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    step: any;
  }) => {
    return step.run("score", async () => {
      await connectDB();
      const loaded = await loadSeekerJobPool(event.data.userId);
      if (!loaded) return { scored: 0 };
      const pool = await scoreSeekerPool(loaded.seekerProfile, loaded.candidateJobs, undefined, {
        jevMode: "cached",
      });
      return { scored: pool.jobs.length };
    });
  },
);
