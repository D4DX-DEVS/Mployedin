/**
 * CV records: registering an uploaded file, finding the CV behind an
 * application, and deciding when a file may be deleted.
 *
 * The rule the rest follows from: an application is scored on the CV it was
 * sent with. Applications store that file's URL, so the file — and its record
 * here — must outlive the seeker replacing it on their profile.
 */

import type { Types } from "mongoose";
import CvDocument, { type CvSource, type CvStatus, type CvTextSource } from "@/models/CvDocument";
import Application from "@/models/Application";
import { inngest } from "@/lib/inngest/client";
import { deleteFile } from "@/lib/storage/spaces";
import logger from "@/lib/logger";
import { applicantCvOf, CV_PARSER_VERSION, resumeUrlOf, type ApplicantCv, type ParsedCv } from "@/lib/cv/parsedCv";

export const CV_PROCESS_EVENT = "cv/process.requested";

type Id = string | Types.ObjectId;

export interface RegisterCvInput {
  jobSeekerId: Id;
  userId?: Id;
  fileUrl: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  fingerprint?: string;
  source: CvSource;
}

export interface CvProcessRequest {
  cvDocumentId: string;
  /** One seeker's CVs are read one at a time, so a duplicate reuses the first reading. */
  jobSeekerId: string;
}

/**
 * Queue reading for these records. Never throws: an upload must not fail
 * because the queue is down — the record stays "uploaded" and the backfill
 * (scripts/backfill-cv-documents.ts) reads it.
 */
export async function queueCvProcessing(requests: readonly CvProcessRequest[]): Promise<void> {
  if (requests.length === 0) return;
  try {
    await inngest.send(requests.map((data) => ({ name: CV_PROCESS_EVENT, data })));
  } catch (err) {
    logger.error({ err, cvDocumentIds: requests.slice(0, 20).map((r) => r.cvDocumentId) }, "[cv] failed to queue CV processing");
  }
}

function isDuplicateKey(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: number }).code === 11000);
}

/**
 * Record a CV file — once per file — and queue its reading unless it has been
 * read already. Safe to call again for the same file.
 */
export async function registerCvDocument(
  input: RegisterCvInput,
  options: { queue?: boolean } = {},
): Promise<{ id: string; status: CvStatus }> {
  const filter = { jobSeekerId: input.jobSeekerId, fileUrl: input.fileUrl };
  const insert = {
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.fileName ? { fileName: input.fileName } : {}),
    ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    ...(input.size ? { size: input.size } : {}),
    ...(input.fingerprint ? { fingerprint: input.fingerprint } : {}),
    source: input.source,
    status: "uploaded",
    attempts: 0,
  };
  let doc: { _id: unknown; status: CvStatus } | null;
  try {
    doc = await CvDocument.findOneAndUpdate(filter, { $setOnInsert: insert }, { upsert: true, returnDocument: "after" })
      .select("_id status")
      .lean<{ _id: unknown; status: CvStatus }>();
  } catch (err) {
    // Two requests registering the same file at once: the other one won.
    if (!isDuplicateKey(err)) throw err;
    doc = await CvDocument.findOne(filter).select("_id status").lean<{ _id: unknown; status: CvStatus }>();
  }
  if (!doc) throw new Error("CV record could not be created");
  const id = String(doc._id);
  if (options.queue !== false && doc.status !== "processed") {
    await queueCvProcessing([{ cvDocumentId: id, jobSeekerId: String(input.jobSeekerId) }]);
  }
  return { id, status: doc.status };
}

/**
 * Record a CV that was read on the request path (the auto-fill upload parses
 * the file itself), so it is not read — and paid for — a second time.
 */
export async function saveReadCv(
  input: RegisterCvInput & { text: string; textSource: CvTextSource; parsed: ParsedCv | null },
): Promise<string> {
  const { text, textSource, parsed, ...file } = input;
  const doc = await CvDocument.findOneAndUpdate(
    { jobSeekerId: file.jobSeekerId, fileUrl: file.fileUrl },
    {
      $set: {
        ...(file.userId ? { userId: file.userId } : {}),
        ...(file.fileName ? { fileName: file.fileName } : {}),
        ...(file.mimeType ? { mimeType: file.mimeType } : {}),
        ...(file.size ? { size: file.size } : {}),
        ...(file.fingerprint ? { fingerprint: file.fingerprint } : {}),
        source: file.source,
        status: "processed",
        text,
        textSource,
        parsed,
        parserVersion: CV_PARSER_VERSION,
        processedAt: new Date(),
      },
      $unset: { error: 1 },
      $setOnInsert: { attempts: 0 },
    },
    { upsert: true, returnDocument: "after" },
  )
    .select("_id")
    .lean<{ _id: unknown }>();
  return String(doc?._id);
}

/**
 * The CV behind one application's score: the resume sent with it, else — for
 * applications created without attachments (auto-apply, the assistant) — the
 * CV on the seeker's profile. A file with no record yet (uploaded before CVs
 * were read) is registered and queued; it reads as "reading" until then.
 */
export async function applicantCvFor(input: ApplicantCvInput): Promise<ApplicantCv> {
  const { attached, url } = cvUrlOf(input);
  if (!url) return { state: "none" };

  const doc = await CvDocument.findOne({ jobSeekerId: input.jobSeekerId, fileUrl: url })
    .select("status fileName text parsed")
    .lean<CvRecordView>();
  if (doc) return applicantCvOf(doc);
  return registerUnseenCv(input, url, attached);
}

/**
 * applicantCvFor for a batch of applications (one job's re-score): the
 * records load in one query instead of one per application.
 */
export async function applicantCvsFor(inputs: readonly ApplicantCvInput[]): Promise<ApplicantCv[]> {
  const wanted = inputs.map((input) => ({ input, ...cvUrlOf(input) }));
  const withUrl = wanted.filter((w) => w.url);
  const docs =
    withUrl.length === 0
      ? []
      : await CvDocument.find({
          jobSeekerId: { $in: [...new Set(withUrl.map((w) => String(w.input.jobSeekerId)))] },
          fileUrl: { $in: [...new Set(withUrl.map((w) => w.url as string))] },
        })
          .select("jobSeekerId fileUrl status fileName text parsed")
          .lean<Array<CvRecordView & { jobSeekerId: unknown; fileUrl: string }>>();
  const byFile = new Map(docs.map((d) => [`${String(d.jobSeekerId)}|${d.fileUrl}`, d]));

  return Promise.all(
    wanted.map(async ({ input, attached, url }): Promise<ApplicantCv> => {
      if (!url) return { state: "none" };
      const doc = byFile.get(`${String(input.jobSeekerId)}|${url}`);
      return doc ? applicantCvOf(doc) : registerUnseenCv(input, url, attached);
    }),
  );
}

export interface ApplicantCvInput {
  jobSeekerId: Id;
  documents?: ReadonlyArray<{ url?: string; type?: string; name?: string }> | null;
  profileCvUrl?: string | null;
}

type CvRecordView = { status: CvStatus; fileName?: string; text?: string; parsed?: unknown };

function cvUrlOf(input: ApplicantCvInput): { attached: string | null; url: string | null } {
  const attached = resumeUrlOf(input.documents);
  return { attached, url: attached ?? input.profileCvUrl ?? null };
}

/**
 * Record a file first met while scoring. Scoring runs this inside loops over
 * a job's applicants, so a failure here must not fail the batch: the CV reads
 * as "reading" and the next score registers it again.
 */
async function registerUnseenCv(input: ApplicantCvInput, url: string, attached: string | null): Promise<ApplicantCv> {
  const entryName = input.documents?.find((d) => d.url === url)?.name;
  try {
    await registerCvDocument({
      jobSeekerId: input.jobSeekerId,
      fileUrl: url,
      // "CV" is the placeholder name applications give the profile CV.
      ...(entryName && entryName !== "CV" ? { fileName: entryName } : {}),
      source: attached ? "application" : "profile",
    });
  } catch (err) {
    logger.warn({ err, jobSeekerId: String(input.jobSeekerId) }, "[cv] could not record an applicant's CV");
  }
  return { state: "reading" };
}

/** Whether any application was sent with this file (a CV or any other attachment). */
export async function isFileInApplications(jobSeekerId: Id, fileUrl: string): Promise<boolean> {
  return Boolean(await Application.exists({ jobSeekerId, "documents.url": fileUrl }));
}

/**
 * The seeker replaced or removed a file. Delete it (and its CV record, if it
 * is a CV) — unless an application was sent with it: the employer keeps what
 * they received, and that application keeps being scored on it. Returns
 * whether it was deleted.
 */
export async function releaseSeekerFile(jobSeekerId: Id, fileUrl: string): Promise<boolean> {
  if (await isFileInApplications(jobSeekerId, fileUrl)) return false;
  try {
    await deleteFile(fileUrl);
  } catch {
    // Storage errors are ignored here as they always were; the record goes.
  }
  await CvDocument.deleteOne({ jobSeekerId, fileUrl });
  return true;
}

/** Erasure: every CV record of this seeker, text and reading included. */
export async function deleteCvRecordsOfSeeker(jobSeekerId: Id): Promise<void> {
  await CvDocument.deleteMany({ jobSeekerId });
}

/** Reading state per file, for the seeker's document list. */
export async function cvStatusesFor(
  jobSeekerId: Id,
  fileUrls: readonly string[],
): Promise<Map<string, { status: CvStatus; error?: string }>> {
  const out = new Map<string, { status: CvStatus; error?: string }>();
  if (fileUrls.length === 0) return out;
  const docs = await CvDocument.find({ jobSeekerId, fileUrl: { $in: fileUrls } })
    .select("fileUrl status error")
    .lean<Array<{ fileUrl: string; status: CvStatus; error?: string }>>();
  for (const doc of docs) out.set(doc.fileUrl, { status: doc.status, ...(doc.error ? { error: doc.error } : {}) });
  return out;
}
