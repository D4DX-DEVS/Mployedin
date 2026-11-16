/**
 * What an erased seeker leaves in other people's records.
 *
 * The employer's hiring records stay after erasure (status, dates, scores, the
 * offer itself) so pipelines, reports and commissions don't change. Nothing in
 * them may still name or describe the person: free text written by or about
 * them, quotes taken from their CV, and names cached on other documents.
 * [LEGAL] The typed name on an accepted offer's e-signature is kept as the
 * record of acceptance until the solicitor rules; its IP address goes.
 *
 * Every step is safe to run twice: a failure fails the erasure and the request
 * stays in progress for the admin to retry. On a retry the person's old name
 * is no longer known, so the name fields are overwritten by key as well as by
 * matching the text.
 */
import { Types } from "mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import InterviewQuestion from "@/models/InterviewQuestion";
import Offer from "@/models/Offer";
import OfferLetter from "@/models/OfferLetter";
import EmployeeReferral from "@/models/EmployeeReferral";
import Notification from "@/models/Notification";
import Placement from "@/models/Placement";
import Scorecard from "@/models/Scorecard";
import ApplicationFeedback from "@/models/ApplicationFeedback";
import { CandidateNPS } from "@/models/CandidateNPS";
import { SurveyResponse } from "@/models/CandidateSurvey";
import AssessmentAttempt from "@/models/AssessmentAttempt";
import EmailLog from "@/models/EmailLog";
import { mirrorLogErase } from "@/lib/logs/logStore";
import { escapeRegex } from "@/lib/security/sanitize";

export const DELETED_NAME = "Deleted User";

/** Keys that always hold the candidate's name on a notification about them. */
const NAME_KEYS = new Set(["candidateName", "seekerName", "applicantName"]);

export interface HiringTraceSubject {
  userId: string;
  seekerId: unknown;
  applicationIds: unknown[];
  /** The person's names as they read before erasure (account name, profile full name). */
  names: string[];
  /** Their email before erasure; null when it is already gone. */
  email: string | null | undefined;
  anonymizedEmail: string;
}

function usableNames(names: readonly string[]): string[] {
  const placeholder = DELETED_NAME.toLowerCase();
  const unique = new Set(names.map((n) => n.trim()).filter((n) => n.length >= 2 && n.toLowerCase() !== placeholder));
  // Longest first, so "Sara Al Amin" goes before "Sara" can split it.
  return [...unique].sort((a, b) => b.length - a.length);
}

function exactEmail(email: string): RegExp {
  return new RegExp(`^${escapeRegex(email.trim())}$`, "i");
}

/**
 * The text with the person's names and email swapped for the placeholders. A
 * name only matches as a whole word ("Sara" leaves "Saratoga"), in any case and
 * any script, and also in its URL-encoded forms, for search links.
 */
export function redactPersonText(text: string, names: readonly string[], email: string | null | undefined, anonymizedEmail: string): string {
  // The email first: a name inside it ("sara.amin@…") would otherwise be replaced on its own.
  let out = email ? text.replace(new RegExp(escapeRegex(email.trim()), "gi"), anonymizedEmail) : text;
  for (const name of usableNames(names)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(name)}(?![\\p{L}\\p{N}])`, "giu"), DELETED_NAME);
    for (const [encoded, placeholder] of [
      [encodeURIComponent(name), encodeURIComponent(DELETED_NAME)],
      [encodeURIComponent(name).replace(/%20/g, "+"), encodeURIComponent(DELETED_NAME).replace(/%20/g, "+")],
    ]) {
      if (encoded !== name) out = out.split(encoded).join(placeholder);
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/** A notification's meta with every string redacted and the name keys overwritten. ObjectIds and dates pass through. */
function redactDeep(value: unknown, redact: (text: string) => string): unknown {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, redact));
  if (!isPlainObject(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, v]) => [key, NAME_KEYS.has(key) && typeof v === "string" ? DELETED_NAME : redactDeep(v, redact)]),
  );
}

/** An id as both a string and an ObjectId: notification meta stores either. */
function idForms(ids: unknown[]): unknown[] {
  const strings = ids.map(String);
  return [...strings, ...strings.filter((s) => Types.ObjectId.isValid(s)).map((s) => new Types.ObjectId(s))];
}

async function idsOf(model: { find: (filter: Record<string, unknown>) => { select: (f: string) => { lean: () => Promise<unknown> } } }, filter: Record<string, unknown>): Promise<unknown[]> {
  const rows = (await model.find(filter).select("_id").lean()) as Array<{ _id: unknown }>;
  return rows.map((r) => r._id);
}

/**
 * Array parts of an application that hold what staff wrote or what was quoted
 * from the CV: status-history notes (bulk reject copies the rejection reason
 * there) and the requirement check's quotes. The status, dates and verdicts
 * stay. Shared by erasure and the 24-month retention job. Each runs only where
 * the array exists: a `$[]` update fails on a document without the field.
 */
export async function scrubApplicationTraces(filter: Record<string, unknown>): Promise<void> {
  await Promise.all([
    Application.updateMany({ ...filter, "statusHistory.0": { $exists: true } }, { $unset: { "statusHistory.$[].note": 1 } }),
    Application.updateMany({ ...filter, "qualifications.0": { $exists: true } }, { $unset: { "qualifications.$[].actual": 1 } }),
  ]);
}

async function eraseOfferLetters(offerIds: unknown[], s: HiringTraceSubject): Promise<void> {
  if (offerIds.length === 0) return;
  const redact = (text: string) => redactPersonText(text, s.names, s.email, s.anonymizedEmail);
  const letters = (await OfferLetter.find({ offerId: { $in: offerIds } }).select("content variableValues").lean()) as Array<{
    _id: unknown;
    content?: string;
    variableValues?: Record<string, string>;
  }>;
  if (letters.length === 0) return;
  await OfferLetter.bulkWrite(letters.map((letter) => ({
    updateOne: {
      filter: { _id: letter._id },
      update: {
        $set: {
          candidateName: DELETED_NAME,
          candidateEmail: s.anonymizedEmail,
          content: redact(letter.content ?? ""),
          variableValues: redactDeep(letter.variableValues ?? {}, redact),
        },
        $unset: { signatureData: 1, signatureIp: 1, declineReason: 1 },
      },
    },
  })));
}

/** Referrals of this person. Returns the referred CV files for the caller to delete from storage. */
async function eraseReferrals(s: HiringTraceSubject): Promise<string[]> {
  const or: Record<string, unknown>[] = [{ applicationId: { $in: s.applicationIds } }];
  if (s.email) or.push({ candidateEmail: exactEmail(s.email) });
  const referrals = (await EmployeeReferral.find({ $or: or }).select("_id candidateResumeUrl").lean()) as Array<{ _id: unknown; candidateResumeUrl?: string }>;
  if (referrals.length === 0) return [];
  await EmployeeReferral.updateMany(
    { _id: { $in: referrals.map((r) => r._id) } },
    { $set: { candidateName: DELETED_NAME, candidateEmail: s.anonymizedEmail }, $unset: { candidatePhone: 1, candidateResumeUrl: 1, notes: 1 } },
  );
  return referrals.map((r) => r.candidateResumeUrl).filter((u): u is string => Boolean(u));
}

/** Other users' notifications about this person's applications, offers, placements or profile. */
async function eraseNotifications(s: HiringTraceSubject, offerIds: unknown[], placementIds: unknown[]): Promise<void> {
  const redact = (text: string) => redactPersonText(text, s.names, s.email, s.anonymizedEmail);
  const rows = (await Notification.find({
    userId: { $ne: s.userId },
    $or: [
      { "meta.applicationId": { $in: idForms(s.applicationIds) } },
      { "meta.offerId": { $in: idForms(offerIds) } },
      { "meta.placementId": { $in: idForms(placementIds) } },
      { "meta.jobSeekerId": { $in: idForms([s.seekerId]) } },
    ],
  }).select("title body actionUrl meta").lean()) as Array<{ _id: unknown; title?: string; body?: string; actionUrl?: string; meta?: unknown }>;

  const ops = rows.flatMap((n) => {
    const $set: Record<string, unknown> = {};
    for (const key of ["title", "body", "actionUrl"] as const) {
      if (typeof n[key] === "string") $set[key] = redact(n[key] as string);
    }
    if (n.meta !== undefined) $set.meta = redactDeep(n.meta, redact);
    const changed = Object.entries($set).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(n[key as keyof typeof n]));
    return changed ? [{ updateOne: { filter: { _id: n._id }, update: { $set } } }] : [];
  });
  if (ops.length) await Notification.bulkWrite(ops);
}

/**
 * Erase what a seeker left in hiring records outside their profile and
 * applications. Returns stored files (referred CVs) for the caller's storage delete.
 */
export async function eraseSeekerHiringTraces(s: HiringTraceSubject): Promise<string[]> {
  const bySeeker = { jobSeekerId: s.seekerId };
  const [interviewIds, offerIds, placementIds] = await Promise.all([
    idsOf(Interview, bySeeker),
    idsOf(Offer, bySeeker),
    idsOf(Placement, bySeeker),
  ]);

  await Promise.all([
    // Interviewer feedback is what staff wrote about them; the reschedule note is theirs; the token answers their email link.
    Interview.updateMany(bySeeker, { $unset: { feedback: 1, candidateRescheduleNote: 1, responseToken: 1 } }),
    interviewIds.length
      ? InterviewQuestion.updateMany({ interviewId: { $in: interviewIds }, candidateName: { $exists: true } }, { $set: { candidateName: DELETED_NAME } })
      : null,
    Offer.updateMany(bySeeker, { $unset: { declineReason: 1, "counterOffer.note": 1, "signature.ip": 1 } }),
    Offer.updateMany(
      { ...bySeeker, "events.actorRole": "job_seeker" },
      { $set: { "events.$[e].actorName": DELETED_NAME }, $unset: { "events.$[e].note": 1 } },
      { arrayFilters: [{ "e.actorRole": "job_seeker" }] },
    ),
    Scorecard.updateMany(bySeeker, { $unset: { notes: 1 } }),
    Placement.updateMany(bySeeker, { $unset: { notes: 1 } }),
    // What they wrote; ratings and scores stay for the employer's numbers.
    ApplicationFeedback.updateMany({ userId: s.userId }, { $unset: { comment: 1 } }),
    CandidateNPS.updateMany({ candidateId: s.seekerId }, { $unset: { comment: 1 } }),
    // A pipeline (keeps only the numeric answers): Mongoose refuses one without `updatePipeline`.
    SurveyResponse.updateMany({ candidateId: s.userId }, [
      { $set: { answers: { $filter: { input: { $ifNull: ["$answers", []] }, cond: { $isNumber: "$$this.value" } } } } },
      { $unset: "comment" },
    ], { updatePipeline: true }),
    AssessmentAttempt.updateMany({ userId: s.userId, "answers.0": { $exists: true } }, { $unset: { "answers.$[].answer": 1 } }),
    eraseOfferLetters(offerIds, s),
    eraseNotifications(s, offerIds, placementIds),
  ]);

  return eraseReferrals(s);
}

/** The delivery log of emails sent to this person (any role), in Mongo and its D1 copy. */
export async function eraseEmailLog(userId: string, email: string | null | undefined): Promise<void> {
  const or: Record<string, unknown>[] = [{ userId }];
  if (email) or.push({ to: exactEmail(email) });
  await EmailLog.deleteMany({ $or: or });
  await mirrorLogErase("email_log", "user_id", [userId]);
  if (email) await mirrorLogErase("email_log", "to_address", [...new Set([email.trim(), email.trim().toLowerCase()])]);
}
