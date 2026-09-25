/**
 * Read every CV already on file, then re-score the applications that use them.
 *
 * Before 2026-09-25 an uploaded CV was stored but never read: a plain upload
 * kept only the file, and the auto-fill upload wiped the text it had read. The
 * ATS therefore scored most candidates on their typed profile alone. This
 * records each CV file (the profile CV, library resumes, and resumes attached
 * to applications), reads it through the same code uploads now use
 * (src/lib/cv/processCv.ts), and re-scores the applications that use it.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-cv-documents.ts            # dry run: counts only
 *   ... --apply                 record, read and re-score
 *   ... --seeker <jobSeekerId>  only this seeker (repeatable)
 *   ... --limit <n>             read at most n CVs in this run
 *   ... --retry-failed          read files that failed before again
 *   ... --no-rescore            read only
 *
 * Cost: one AI parse (Gemini flash) per CV not read before; an identical file
 * of the same seeker is copied, not read again. Re-scoring may call Jev and
 * the embedder, like any score. The dry run prints how many CVs would be read.
 *
 * Idempotent: records are keyed by file, and a CV read by the current parser
 * is skipped. Never changes an application's status.
 */

import mongoose from "mongoose";
import Application from "@/models/Application";
import JobSeeker from "@/models/JobSeeker";
import CvDocument from "@/models/CvDocument";
import { registerCvDocument } from "@/lib/cv/cvDocuments";
import { MAX_CV_ATTEMPTS, pendingCvFilter, processCvDocument } from "@/lib/cv/processCv";
import { applicantMatchUpdate, scoreApplicationsOfJob } from "@/lib/matching/scoreApplication";
import type { CvSource } from "@/models/CvDocument";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const RETRY_FAILED = args.includes("--retry-failed");
const RESCORE = !args.includes("--no-rescore");
const seekerIds = args.flatMap((a, i) => (a === "--seeker" && args[i + 1] ? [args[i + 1]] : []));
const limitArg = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const BATCH = 25;

const out = (line: string) => process.stdout.write(`${line}\n`);

interface CvFile {
  jobSeekerId: string;
  userId?: string;
  fileUrl: string;
  fileName?: string;
  source: CvSource;
}

type Id = mongoose.Types.ObjectId;

/** Every CV file on record, once each: profile CVs, library resumes, application resumes. */
async function collectFiles(): Promise<CvFile[]> {
  const scope = seekerIds.length ? { _id: { $in: seekerIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {};
  const seekers = (await JobSeeker.find({
    ...scope,
    $or: [{ "cv.originalUrl": { $nin: [null, ""] } }, { "documents.category": "resume" }],
  })
    .select("_id userId cv.originalUrl documents")
    .lean()) as Array<{ _id: Id; userId?: Id; cv?: { originalUrl?: string }; documents?: Array<{ url: string; name?: string; category?: string }> }>;

  const files = new Map<string, CvFile>();
  const add = (file: CvFile) => {
    const key = `${file.jobSeekerId}|${file.fileUrl}`;
    if (!files.has(key)) files.set(key, file);
  };
  for (const s of seekers) {
    const base = { jobSeekerId: String(s._id), ...(s.userId ? { userId: String(s.userId) } : {}) };
    if (s.cv?.originalUrl) add({ ...base, fileUrl: s.cv.originalUrl, source: "profile" });
    for (const d of s.documents ?? []) {
      if (d.category === "resume" && d.url) add({ ...base, fileUrl: d.url, fileName: d.name, source: "document" });
    }
  }

  const appScope = seekerIds.length ? { jobSeekerId: { $in: seekerIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {};
  const apps = (await Application.find({ ...appScope, "documents.type": "resume" })
    .select("jobSeekerId documents")
    .lean()) as Array<{ jobSeekerId: Id; documents?: Array<{ url?: string; name?: string; type?: string }> }>;
  for (const a of apps) {
    for (const d of a.documents ?? []) {
      if (d.type === "resume" && d.url) {
        add({ jobSeekerId: String(a.jobSeekerId), fileUrl: d.url, ...(d.name && d.name !== "CV" ? { fileName: d.name } : {}), source: "application" });
      }
    }
  }
  return [...files.values()];
}

async function rescoreJob(jobId: string): Promise<number> {
  const rows = (await Application.find({ jobId, status: { $ne: "withdrawn" } }).select("_id").lean()) as Array<{ _id: Id }>;
  const ids = rows.map((r) => String(r._id));
  let written = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const scored = await scoreApplicationsOfJob(jobId, ids.slice(i, i + BATCH));
    if (scored.length === 0) continue;
    await Application.bulkWrite(
      scored.map(({ applicationId, match }) => ({
        updateOne: { filter: { _id: applicationId }, update: { $set: applicantMatchUpdate(match) } },
      })),
    );
    written += scored.length;
  }
  return written;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set. Run with --env-file=.env");
  await mongoose.connect(uri);

  const files = await collectFiles();
  const seekerScope = seekerIds.length ? { jobSeekerId: { $in: seekerIds.map((id) => new mongoose.Types.ObjectId(id)) } } : {};
  const known = new Set(
    ((await CvDocument.find(seekerScope).select("jobSeekerId fileUrl").lean()) as Array<{ jobSeekerId: Id; fileUrl: string }>)
      .map((d) => `${d.jobSeekerId}|${d.fileUrl}`),
  );
  const unrecorded = files.filter((f) => !known.has(`${f.jobSeekerId}|${f.fileUrl}`));
  const [pending, failed] = await Promise.all([
    CvDocument.countDocuments({ ...seekerScope, ...pendingCvFilter() }),
    CvDocument.countDocuments({ ...seekerScope, status: "failed" }),
  ]);

  out(`${files.length} CV file(s) on record; ${unrecorded.length} not yet recorded.`);
  out(`${pending} recorded CV(s) waiting to be read; ${failed} failed before${RETRY_FAILED ? " (will retry)" : ""}.`);
  out(`Up to ${Math.min(unrecorded.length + pending + (RETRY_FAILED ? failed : 0), limitArg)} CV(s) would be read — at most one AI parse each.`);
  if (!APPLY) {
    out("Dry run — nothing written. Re-run with --apply.");
    await mongoose.disconnect();
    return;
  }

  for (const file of unrecorded) await registerCvDocument(file, { queue: false });
  if (RETRY_FAILED) {
    await CvDocument.updateMany({ ...seekerScope, status: "failed" }, { $set: { status: "uploaded", attempts: 0 }, $unset: { error: 1 } });
  }

  const queue = (await CvDocument.find({ ...seekerScope, ...pendingCvFilter() })
    .sort({ createdAt: 1 })
    .limit(Number.isFinite(limitArg) ? limitArg : 0)
    .select("_id")
    .lean()) as Array<{ _id: Id }>;

  const tally: Record<string, number> = {};
  const jobIds = new Set<string>();
  for (const { _id } of queue) {
    let result: Awaited<ReturnType<typeof processCvDocument>> | null = null;
    // The queue retries a transient failure; so does this loop, up to the same limit.
    for (let attempt = 1; attempt <= MAX_CV_ATTEMPTS && !result; attempt++) {
      try {
        result = await processCvDocument(String(_id));
      } catch (err) {
        out(`  ${_id}: attempt ${attempt} failed (${(err as Error).message}); retrying`);
      }
    }
    const label = !result
      ? "error"
      : result.outcome === "processed"
        ? `processed:${result.textSource}${result.parsed ? "" : ":text-only"}`
        : result.outcome === "failed"
          ? `failed:${result.error}`
          : result.outcome;
    tally[label] = (tally[label] ?? 0) + 1;
    if (result && (result.outcome === "processed" || result.outcome === "failed")) {
      result.jobIds.forEach((id) => jobIds.add(id));
      const filled = result.outcome === "processed" && result.profileFilled.length ? ` · profile filled: ${result.profileFilled.join(", ")}` : "";
      out(`  ${_id}: ${label}${filled}`);
    }
  }
  out(`Read: ${JSON.stringify(tally)}`);

  if (RESCORE && jobIds.size > 0) {
    let rescored = 0;
    for (const jobId of jobIds) rescored += await rescoreJob(jobId);
    out(`Re-scored ${rescored} application(s) across ${jobIds.size} job(s).`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
