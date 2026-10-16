/**
 * Decide the Jev verdicts a page render found missing. Renders never call Jev
 * (they waited up to 79 s on it); they queue the misses here, and the next view
 * reads the stored verdicts.
 */
import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";
import { fillJevVerdicts, type JevFillRequest } from "@/lib/matching/recommend";
import { JEV_FILL_EVENT } from "@/lib/matching/jevFillQueue";

export const jevFillFunction = inngest.createFunction(
  {
    id: "jev-fill",
    name: "Fill Jev verdicts",
    retries: 1,
    // Two seekers at a time, four Jev calls each: kind to OpenRouter's rate limit.
    concurrency: [{ limit: 2 }],
    triggers: [{ event: JEV_FILL_EVENT }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: JevFillRequest };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    step: any;
  }) => {
    await connectDB();
    return step.run("fill", () => fillJevVerdicts(event.data, mongoJevVerdictStore));
  },
);
