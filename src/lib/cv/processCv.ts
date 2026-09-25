/**
 * Reads one CV record: text layer → AI parser → saved reading → profile
 * auto-fill → the list of jobs whose applicants to re-score.
 *
 * Runs off the request path (lib/inngest/processCvDocument.ts, and the
 * backfill script). Idempotent: a record already read with the current parser
 * is skipped, and an identical file this seeker uploaded before is copied
 * rather than paid for again.
 */

import { createHash } from "crypto";
import CvDocument, { type CvStatus, type CvTextSource } from "@/models/CvDocument";
import JobSeeker from "@/models/JobSeeker";
import Application from "@/models/Application";
import { downloadBuffer } from "@/lib/storage/spaces";
import { guessMime } from "@/lib/storage/mime";
import { extractResumeText } from "@/lib/ats/analyzeCv";
import { generateMultimodal, generateText, GEMINI_MODELS } from "@/lib/ai/gemini";
import { AI_TOKEN_LIMITS } from "@/lib/ai/sanitize";
import { profileCompletenessScore } from "@/lib/jobSeeker/profileCompleteness";
import logger from "@/lib/logger";
import {
  CV_PARSE_PROMPT,
  CV_PARSER_VERSION,
  MAX_CV_TEXT,
  MIN_TEXT_LAYER_CHARS,
  cvTextFromParsed,
  hasParsedContent,
  normalizeParsedCv,
  type ParsedCv,
} from "@/lib/cv/parsedCv";

/** Tries per file, across queue retries, before it is marked failed. */
export const MAX_CV_ATTEMPTS = 3;
/** Longest text sent to the parser. */
const MAX_PROMPT_TEXT = 30_000;
/** A record stuck in "processing" this long belongs to a worker that died. */
const STALE_PROCESSING_MS = 10 * 60 * 1000;

const VISION_MIMES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

/** A failure retrying cannot fix. */
export class PermanentCvError extends Error {
  constructor(readonly code: "file_missing" | "unreadable" | "unsupported_type") {
    super(code);
    this.name = "PermanentCvError";
  }
}

export type CvProcessOutcome =
  | { outcome: "missing" }
  | { outcome: "skipped"; status: CvStatus }
  | { outcome: "processed"; textSource: CvTextSource; parsed: boolean; profileFilled: string[]; jobIds: string[] }
  | { outcome: "failed"; error: string; jobIds: string[] };

interface ClaimedCv {
  _id: unknown;
  jobSeekerId: unknown;
  fileUrl: string;
  mimeType?: string;
  attempts: number;
}

interface Reading {
  fingerprint: string;
  text: string;
  textSource: CvTextSource;
  parsed: ParsedCv | null;
}

function parseJson(raw: string): unknown {
  const cleaned = raw.replace(/```json\n?|```\n?/g, "").trim();
  return JSON.parse(cleaned);
}

function isMissingObject(err: unknown): boolean {
  const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } } | null;
  return e?.name === "NoSuchKey" || e?.Code === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404;
}

/** Records still to read: never read, stuck in a dead run, or read by an older parser. */
export function pendingCvFilter(now: Date = new Date()): Lean {
  return {
    $or: [
      { status: "uploaded" },
      { status: "processing", updatedAt: { $lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
      { status: "processed", parserVersion: { $ne: CV_PARSER_VERSION } },
    ],
  };
}

/** Take the record for this run, or null when another run holds it or it needs nothing. */
async function claim(id: string): Promise<ClaimedCv | null> {
  return CvDocument.findOneAndUpdate(
    { _id: id, ...pendingCvFilter() },
    { $set: { status: "processing" }, $inc: { attempts: 1 } },
    { returnDocument: "after" },
  )
    .select("_id jobSeekerId fileUrl mimeType attempts")
    .lean<ClaimedCv>();
}

async function parseText(text: string): Promise<ParsedCv> {
  const raw = await generateText(
    `${CV_PARSE_PROMPT}\n\nCV text:\n${text.slice(0, MAX_PROMPT_TEXT)}`,
    GEMINI_MODELS.flash,
    AI_TOKEN_LIMITS.cv_extract,
  );
  return normalizeParsedCv(parseJson(raw));
}

async function parseFile(buffer: Buffer, mimeType: string): Promise<ParsedCv> {
  const raw = await generateMultimodal(
    [{ text: CV_PARSE_PROMPT }, { inlineData: { mimeType, data: buffer.toString("base64") } }],
    GEMINI_MODELS.flash,
    AI_TOKEN_LIMITS.cv_extract,
  );
  return normalizeParsedCv(parseJson(raw));
}

async function readCv(cv: ClaimedCv, finalAttempt: boolean): Promise<Reading> {
  let buffer: Buffer;
  try {
    buffer = await downloadBuffer(cv.fileUrl);
  } catch (err) {
    if (isMissingObject(err)) throw new PermanentCvError("file_missing");
    throw err;
  }
  const fingerprint = createHash("sha256").update(buffer).digest("hex");

  // The same file again (re-uploaded, or attached from the library): copy the reading.
  const twin = await CvDocument.findOne({
    _id: { $ne: cv._id },
    jobSeekerId: cv.jobSeekerId,
    fingerprint,
    status: "processed",
    parserVersion: CV_PARSER_VERSION,
  })
    .select("text parsed")
    .lean<{ text?: string; parsed?: unknown }>();
  if (twin) {
    return { fingerprint, text: twin.text ?? "", textSource: "reused", parsed: twin.parsed ? normalizeParsedCv(twin.parsed) : null };
  }

  const mimeType = cv.mimeType || guessMime(cv.fileUrl);
  let layer = "";
  try {
    layer = (await extractResumeText(buffer, mimeType)).text;
  } catch (err) {
    // A damaged text layer is read like a scan below.
    logger.warn({ err, cvDocumentId: String(cv._id) }, "[cv] text extraction failed");
  }

  if (layer.length >= MIN_TEXT_LAYER_CHARS) {
    const text = layer.slice(0, MAX_CV_TEXT);
    try {
      return { fingerprint, text, textSource: "text_layer", parsed: await parseText(layer) };
    } catch (err) {
      // The text alone is still evidence the ATS can search. Keep it rather
      // than fail the file once the retries are spent.
      if (!finalAttempt) throw err;
      logger.warn({ err, cvDocumentId: String(cv._id) }, "[cv] parse failed on the last attempt; keeping the text");
      return { fingerprint, text, textSource: "text_layer", parsed: null };
    }
  }

  if (!VISION_MIMES.has(mimeType)) throw new PermanentCvError("unsupported_type");
  const parsed = await parseFile(buffer, mimeType);
  if (!hasParsedContent(parsed)) throw new PermanentCvError("unreadable");
  return { fingerprint, text: cvTextFromParsed(parsed).slice(0, MAX_CV_TEXT), textSource: "ai_vision", parsed };
}

type Lean = Record<string, unknown>;

const isEmpty = (field: string) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: { $size: 0 } }] });
const isBlank = (field: string) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: "" }] });

/**
 * When this file is the seeker's current profile CV: keep its text for the
 * seeker-side matcher, and fill profile sections the seeker left empty. A
 * section they filled in is never touched — each fill is conditional on the
 * section still being empty at write time.
 */
async function fillProfile(cv: ClaimedCv, reading: Reading): Promise<string[]> {
  const seeker = await JobSeeker.findOne({ _id: cv.jobSeekerId, "cv.originalUrl": cv.fileUrl }).select("_id").lean();
  if (!seeker) return [];
  const id = (seeker as { _id: unknown })._id;
  // Every write also requires the file to still be the profile CV: the seeker
  // may replace it while this one is being read, and the old file must not
  // then fill the profile the newer one is about to.
  const stillProfileCv = { _id: id, "cv.originalUrl": cv.fileUrl };

  await JobSeeker.updateOne(stillProfileCv, { $set: { "cv.rawText": reading.text, "cv.parsedAt": new Date() } });

  const parsed = reading.parsed;
  if (!parsed) return [];
  const arrays: Array<[string, unknown[]]> = [
    ["skills", parsed.skills],
    // Entries the profile schema would reject (no title, no company) stay out.
    ["experience", parsed.experience.filter((e) => e.jobTitle && e.company)],
    ["education", parsed.education.filter((e) => e.degree && e.institution)],
    ["languages", parsed.languages],
    ["certifications", parsed.certifications],
  ];
  const texts: Array<[string, string]> = [
    ["currentLocation", parsed.currentLocation],
    ["summary", parsed.headline],
  ];

  const filled: string[] = [];
  // 0 is the schema default, so a stated total of 0 counts as empty.
  if (parsed.totalExperienceYears > 0) {
    const res = await JobSeeker.updateOne(
      { ...stillProfileCv, $or: [{ totalExperienceYears: { $exists: false } }, { totalExperienceYears: null }, { totalExperienceYears: 0 }] },
      { $set: { totalExperienceYears: parsed.totalExperienceYears } },
    );
    if (res.modifiedCount > 0) filled.push("totalExperienceYears");
  }
  for (const [field, value] of arrays) {
    if (value.length === 0) continue;
    const res = await JobSeeker.updateOne({ ...stillProfileCv, ...isEmpty(field) }, { $set: { [field]: value } });
    if (res.modifiedCount > 0) filled.push(field);
  }
  for (const [field, value] of texts) {
    if (!value) continue;
    const res = await JobSeeker.updateOne({ ...stillProfileCv, ...isBlank(field) }, { $set: { [field]: value } });
    if (res.modifiedCount > 0) filled.push(field);
  }

  if (filled.length > 0) {
    const fresh = await JobSeeker.findById(id).lean();
    if (fresh) {
      await JobSeeker.updateOne(
        { _id: id },
        { $set: { profileCompleteness: profileCompletenessScore(fresh as Parameters<typeof profileCompletenessScore>[0]) } },
      );
    }
  }
  return filled;
}

/**
 * Jobs with an application scored on this file: sent with it, or — when it is
 * the profile CV — sent with no resume at all (those fall back to the profile
 * CV; see applicantCvFor).
 */
async function jobsUsing(cv: ClaimedCv): Promise<string[]> {
  const isProfileCv = Boolean(
    await JobSeeker.exists({ _id: cv.jobSeekerId, "cv.originalUrl": cv.fileUrl }),
  );
  const ids = await Application.distinct("jobId", {
    jobSeekerId: cv.jobSeekerId,
    status: { $ne: "withdrawn" },
    $or: [
      { "documents.url": cv.fileUrl },
      ...(isProfileCv ? [{ "documents.type": { $ne: "resume" } }] : []),
    ],
  });
  return (ids as unknown[]).map(String);
}

/**
 * Read one CV record. Returns the jobs to re-score; the caller queues that.
 *
 * Throws only for a failure worth retrying, after putting the record back to
 * "uploaded". Past MAX_CV_ATTEMPTS, or on a permanent failure, the record is
 * marked failed and the outcome says so — the applications using it are then
 * re-scored too, so their checklist says the CV could not be read.
 */
export async function processCvDocument(cvDocumentId: string): Promise<CvProcessOutcome> {
  const existing = await CvDocument.findById(cvDocumentId).select("status").lean<{ status: CvStatus }>();
  if (!existing) return { outcome: "missing" };

  const cv = await claim(cvDocumentId);
  if (!cv) return { outcome: "skipped", status: existing.status };
  const finalAttempt = cv.attempts >= MAX_CV_ATTEMPTS;

  let reading: Reading;
  try {
    reading = await readCv(cv, finalAttempt);
  } catch (err) {
    const permanent = err instanceof PermanentCvError;
    const code = permanent ? err.code : "error";
    if (permanent || finalAttempt) {
      await CvDocument.updateOne({ _id: cv._id }, { $set: { status: "failed", error: code } });
      logger.warn({ err, cvDocumentId, code }, "[cv] CV could not be read");
      return { outcome: "failed", error: code, jobIds: await jobsUsing(cv) };
    }
    await CvDocument.updateOne({ _id: cv._id }, { $set: { status: "uploaded", error: code } });
    throw err;
  }

  await CvDocument.updateOne(
    { _id: cv._id },
    {
      $set: {
        status: "processed",
        fingerprint: reading.fingerprint,
        text: reading.text,
        textSource: reading.textSource,
        parsed: reading.parsed,
        parserVersion: CV_PARSER_VERSION,
        processedAt: new Date(),
        // Attempts count one reading's tries: a later re-read (a new parser
        // version) starts with the full retry budget, not what is left of this one.
        attempts: 0,
        ...(reading.parsed ? {} : { error: "parse_failed" }),
      },
      ...(reading.parsed ? { $unset: { error: 1 } } : {}),
    },
  );

  const profileFilled = await fillProfile(cv, reading);
  return {
    outcome: "processed",
    textSource: reading.textSource,
    parsed: reading.parsed !== null,
    profileFilled,
    jobIds: await jobsUsing(cv),
  };
}
