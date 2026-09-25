/**
 * Backfill the employer ATS fields on existing applications.
 *
 * Applications scored before 2026-09-24 carry a score but no requirements
 * checklist, no skills lists and no `scoredAt`. They still rank, but Shortlist
 * Top cannot tell whether they meet the job's requirements, so it treats them
 * as unverified. This re-scores them through the same code the screening
 * worker runs (src/lib/matching/scoreApplication.ts).
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-applicant-ats.ts           # dry run
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-applicant-ats.ts --apply   # write
 *   ... --job <jobId>    only one job
 *
 * Cost: scoring may call Jev (OpenRouter) for pairs within 10 points of the
 * match threshold, and embed skills not yet in the vector cache (Google). The
 * dry run prints how many applications would be scored.
 *
 * Idempotent: only rows without `scoredAt` are touched, withdrawn ones never.
 * Never changes an application's status — no auto-reject, no notifications.
 */

import mongoose from "mongoose";
import Application from "@/models/Application";
import { applicantMatchUpdate, scoreApplicationsOfJob } from "@/lib/matching/scoreApplication";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const jobArg = args.includes("--job") ? args[args.indexOf("--job") + 1] : undefined;
const BATCH = 25;

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Run with --env-file=.env");
  await mongoose.connect(uri);

  const filter: Record<string, unknown> = { scoredAt: null, status: { $ne: "withdrawn" } };
  if (jobArg) filter.jobId = new mongoose.Types.ObjectId(jobArg);

  const byJob = (await Application.aggregate([
    { $match: filter },
    { $group: { _id: "$jobId", ids: { $push: "$_id" } } },
  ])) as Array<{ _id: mongoose.Types.ObjectId; ids: mongoose.Types.ObjectId[] }>;

  const total = byJob.reduce((sum, row) => sum + row.ids.length, 0);
  process.stdout.write(`${total} application(s) across ${byJob.length} job(s) need ATS scoring.\n`);
  if (!APPLY) {
    process.stdout.write("Dry run — nothing written. Re-run with --apply to score them.\n");
    await mongoose.disconnect();
    return;
  }

  let written = 0;
  const outcome: Record<string, number> = {};
  for (const row of byJob) {
    const ids = row.ids.map(String);
    for (let i = 0; i < ids.length; i += BATCH) {
      const scored = await scoreApplicationsOfJob(String(row._id), ids.slice(i, i + BATCH));
      if (scored.length === 0) continue;
      await Application.bulkWrite(
        scored.map(({ applicationId, match }) => ({
          updateOne: { filter: { _id: applicationId }, update: { $set: applicantMatchUpdate(match) } },
        })),
      );
      written += scored.length;
      for (const { match } of scored) outcome[match.requirementsStatus] = (outcome[match.requirementsStatus] ?? 0) + 1;
    }
    process.stdout.write(`  job ${String(row._id)}: ${ids.length} scored\n`);
  }

  process.stdout.write(`Done. ${written} written. Requirements: ${JSON.stringify(outcome)}\n`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
