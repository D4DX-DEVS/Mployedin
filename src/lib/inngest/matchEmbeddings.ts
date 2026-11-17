import { inngest } from "@/lib/inngest/client";
import { fillMissingJobSkills, refreshMatchEmbeddings } from "@/lib/matching/matchEmbeddings";
import { pruneDepartedVectors } from "@/lib/matching/vectorDepartures";
import { vectorSyncEnabled } from "@/lib/matching/vectorStore";

/** Looks back a little further than the 15-minute schedule so a late run misses nothing. */
const CHANGED_WINDOW_MS = 20 * 60 * 1000;
const CHANGED_PER_RUN = 200;
/** Catch-up for documents never processed: 400 an hour per kind until done. */
const MISSING_PER_RUN = 100;

const LIVE_JOBS = { status: "active", deletedAt: null };
const LIVE_SEEKERS = { roleArchivedAt: null };

/**
 * Keeps matching vectors fresh. Off until MATCH_EMBEDDINGS=on, which the owner
 * sets after the Atlas capacity decision (O2) and the index script.
 */
export const refreshMatchEmbeddingsCron = inngest.createFunction(
  {
    id: "refresh-match-embeddings",
    name: "Matching vectors — refresh (every 15 min)",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    if (process.env.MATCH_EMBEDDINGS !== "on") return { skipped: "MATCH_EMBEDDINGS is not on" };
    const since = new Date(Date.now() - CHANGED_WINDOW_MS);

    // VECTOR_STORE=shadow|vectorize: jobs that closed and seekers that archived
    // since the last run leave Vectorize (Atlas filters them at query time
    // instead). First, so an embedding failure below cannot skip it.
    const departed = vectorSyncEnabled()
      ? await step.run("vector-departures", () => pruneDepartedVectors(since))
      : { skipped: "VECTOR_STORE is atlas" };
    if (!process.env.OPENROUTER_API_KEY) return { skipped: "no OpenRouter key", departed };

    const changedJobs = await step.run("changed-jobs", () =>
      refreshMatchEmbeddings("job", { ...LIVE_JOBS, updatedAt: { $gte: since } }, { limit: CHANGED_PER_RUN }),
    );
    const missingJobs = await step.run("missing-jobs", () =>
      refreshMatchEmbeddings("job", { ...LIVE_JOBS, matchTextHash: { $exists: false } }, { limit: MISSING_PER_RUN }),
    );
    const changedSeekers = await step.run("changed-seekers", () =>
      refreshMatchEmbeddings("seeker", { ...LIVE_SEEKERS, updatedAt: { $gte: since } }, { limit: CHANGED_PER_RUN }),
    );
    const missingSeekers = await step.run("missing-seekers", () =>
      refreshMatchEmbeddings("seeker", { ...LIVE_SEEKERS, matchTextHash: { $exists: false } }, { limit: MISSING_PER_RUN }),
    );
    return { changedJobs, missingJobs, changedSeekers, missingSeekers, departed };
  },
);

/** Jobs per run for skill extraction: one text call each. */
const SKILLS_PER_RUN = 20;

/**
 * Fills AI skills for live jobs posted with none. Runs whether or not
 * MATCH_EMBEDDINGS is on: extraction needs only the text model, and without it
 * those jobs are scored on their title alone.
 */
export const fillMissingJobSkillsCron = inngest.createFunction(
  {
    id: "fill-missing-job-skills",
    name: "Job skills — extract for jobs with none (every 15 min)",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [{ cron: "*/15 * * * *" }],
  },
  async ({ step }) => {
    // The text model is OpenRouter or Google direct (lib/ai/gemini.ts).
    const hasTextKey = Boolean(process.env.OPENROUTER_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
    if (!hasTextKey) return { skipped: "no text-model key" };
    return step.run("fill-skills", () => fillMissingJobSkills(SKILLS_PER_RUN));
  },
);
