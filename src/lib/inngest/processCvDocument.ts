/**
 * Read an uploaded CV off the request path, then re-score the applications
 * that use it. See lib/cv/processCv.ts for what reading does.
 *
 * Uploads queue this; so does the scorer when it meets a CV file that was
 * uploaded before CVs were read. A record that is missing (another
 * environment's event) or already read is skipped, not retried.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import { CV_PROCESS_EVENT } from "@/lib/cv/cvDocuments";
import { processCvDocument } from "@/lib/cv/processCv";
import { queueApplicantRescore } from "@/lib/inngest/rescoreJobApplicants";

export const processCvDocumentFunction = inngest.createFunction(
  {
    id: "process-cv-document",
    name: "Read CV",
    // MAX_CV_ATTEMPTS - 1 (Inngest wants a literal): one try per attempt the
    // reader counts, and it marks the file failed on the last.
    retries: 2,
    // Five at a time overall; one seeker's files one after another, so the same
    // CV uploaded twice (profile + library) is read once and copied.
    concurrency: [{ limit: 5 }, { key: "event.data.jobSeekerId", limit: 1 }],
    triggers: [{ event: CV_PROCESS_EVENT }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { cvDocumentId: string; jobSeekerId?: string } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    step: any;
  }) => {
    const { cvDocumentId } = event.data;
    await connectDB();

    const result = await step.run("read-cv", () => processCvDocument(cvDocumentId));

    if ((result.outcome === "processed" || result.outcome === "failed") && result.jobIds.length > 0) {
      await step.run("queue-rescore", () => queueApplicantRescore(result.jobIds));
    }
    return result;
  },
);
