/**
 * Clear what accounts erased before 2026-11-16 still leave in other records.
 *
 * Until then a completed deletion request erased the profile, the application's
 * free text and the files, but left the person's name and words in records that
 * stay: status-history notes (bulk reject copied the rejection reason there),
 * CV quotes in the requirement check, interview feedback and the candidate's
 * reschedule note, offer notes and the e-signature IP, the name cached on AI
 * interview questions, offer letters, referrals and other users' notifications,
 * seeker-written feedback, and the email log. New erasures clear all of that
 * (src/lib/gdpr/hiringTraces.ts); this runs the same code over the old ones.
 *
 * The erased account no longer holds the name or email, so they are read back
 * from the copies this is about to clear (the offer letter, AI questions,
 * notification fields, the email log) and used to find the same name in free
 * text. Names and addresses are never printed: the output is counts per account.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-erased-seeker-traces.ts          # dry run: counts only
 *   ... --apply            clear them
 *   ... --user <userId>    only this erased account (repeatable)
 *
 * Idempotent: a second run finds nothing left to clear. Never changes a status,
 * date or score, and never touches an account that was not erased.
 */

import mongoose from "mongoose";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
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
import { ERASED_APPLICATION_FIELDS } from "@/lib/gdpr/erasure";
import { DELETED_NAME, eraseEmailLog, eraseSeekerHiringTraces, scrubApplicationTraces } from "@/lib/gdpr/hiringTraces";
import { deleteFile } from "@/lib/storage/spaces";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const onlyUsers = args.flatMap((a, i) => (a === "--user" && args[i + 1] ? [args[i + 1]] : []));
const ERASED_EMAIL = /^deleted_[0-9a-f]{24}@anonymized\.mployedin\.com$/;

const out = (line: string) => process.stdout.write(`${line}\n`);
const exists = { $exists: true };
const present = { $exists: true, $nin: ["", null, DELETED_NAME] };

type Row = Record<string, unknown> & { _id: unknown };
const strings = (values: unknown[]): string[] => values.filter((v): v is string => typeof v === "string" && v.trim().length > 0);

type IdFinder = { find: (filter: Record<string, unknown>) => { select: (fields: string) => { lean: () => Promise<unknown> } } };

async function ids(model: IdFinder, filter: Record<string, unknown>): Promise<unknown[]> {
  return ((await model.find(filter).select("_id").lean()) as Row[]).map((r) => r._id);
}

/** The names and addresses the erased account no longer holds, read from the copies still to be cleared. */
async function recoverIdentity(userId: string, applicationIds: unknown[], offerIds: unknown[], interviewIds: unknown[], placementIds: unknown[], seekerId: unknown) {
  const [letters, questions, offers, referrals, notifications, emails] = await Promise.all([
    OfferLetter.find({ offerId: { $in: offerIds } }).select("candidateName candidateEmail").lean() as Promise<Row[]>,
    InterviewQuestion.find({ interviewId: { $in: interviewIds } }).select("candidateName").lean() as Promise<Row[]>,
    Offer.find({ _id: { $in: offerIds } }).select("signature.fullName events.actorName events.actorRole").lean() as Promise<Row[]>,
    EmployeeReferral.find({ applicationId: { $in: applicationIds } }).select("candidateName candidateEmail").lean() as Promise<Row[]>,
    Notification.find({
      userId: { $ne: userId },
      $or: [
        { "meta.applicationId": { $in: [...applicationIds, ...applicationIds.map(String)] } },
        { "meta.offerId": { $in: [...offerIds, ...offerIds.map(String)] } },
        { "meta.placementId": { $in: [...placementIds, ...placementIds.map(String)] } },
        { "meta.jobSeekerId": { $in: [seekerId, String(seekerId)] } },
      ],
    }).select("meta").lean() as Promise<Row[]>,
    EmailLog.distinct("to", { userId }) as Promise<unknown[]>,
  ]);
  const metaNames = notifications.flatMap((n) => {
    const meta = (n.meta ?? {}) as { candidateName?: unknown; seekerName?: unknown; params?: Record<string, unknown> };
    return [meta.candidateName, meta.seekerName, meta.params?.candidateName, meta.params?.seekerName, meta.params?.applicantName];
  });
  const offerNames = offers.flatMap((o) => {
    const events = (o.events ?? []) as Array<{ actorRole?: string; actorName?: string }>;
    return [(o.signature as { fullName?: string } | undefined)?.fullName, ...events.filter((e) => e.actorRole === "job_seeker").map((e) => e.actorName)];
  });
  const names = strings([...letters.map((l) => l.candidateName), ...questions.map((q) => q.candidateName), ...referrals.map((r) => r.candidateName), ...metaNames, ...offerNames]);
  const addresses = strings([...letters.map((l) => l.candidateEmail), ...referrals.map((r) => r.candidateEmail), ...emails]).filter((e) => !ERASED_EMAIL.test(e));
  return { names: [...new Set(names)].filter((n) => n !== DELETED_NAME), emails: [...new Set(addresses.map((e) => e.toLowerCase()))] };
}

/** How many records of each kind still hold something to clear. */
async function countTraces(userId: string, seekerId: unknown, applicationIds: unknown[], offerIds: unknown[], interviewIds: unknown[], emails: string[]) {
  const bySeeker = { jobSeekerId: seekerId };
  const counts = await Promise.all([
    Application.countDocuments({ ...bySeeker, $or: [{ "statusHistory.note": exists }, { "qualifications.actual": present }, { requirementReport: exists }] }),
    Interview.countDocuments({ ...bySeeker, $or: [{ feedback: exists }, { candidateRescheduleNote: exists }, { responseToken: exists }] }),
    InterviewQuestion.countDocuments({ interviewId: { $in: interviewIds }, candidateName: present }),
    Offer.countDocuments({ ...bySeeker, $or: [{ declineReason: exists }, { "counterOffer.note": exists }, { "signature.ip": exists }, { events: { $elemMatch: { actorRole: "job_seeker", $or: [{ actorName: present }, { note: exists }] } } }] }),
    OfferLetter.countDocuments({ offerId: { $in: offerIds }, candidateName: present }),
    EmployeeReferral.countDocuments({ $or: [{ applicationId: { $in: applicationIds } }, { candidateEmail: { $in: emails } }], candidateName: present }),
    Scorecard.countDocuments({ ...bySeeker, notes: exists }),
    Placement.countDocuments({ ...bySeeker, notes: exists }),
    ApplicationFeedback.countDocuments({ userId, comment: exists }),
    CandidateNPS.countDocuments({ candidateId: seekerId, comment: exists }),
    SurveyResponse.countDocuments({ candidateId: userId, $or: [{ comment: exists }, { "answers.value": { $type: "string" } }] }),
    AssessmentAttempt.countDocuments({ userId, "answers.answer": exists }),
    EmailLog.countDocuments({ $or: [{ userId }, { to: { $in: emails } }] }),
  ]);
  const labels = ["applications", "interviews", "aiQuestions", "offers", "offerLetters", "referrals", "scorecards", "placements", "feedback", "nps", "surveys", "assessments", "emailLog"];
  return Object.fromEntries(labels.map((label, i) => [label, counts[i]])) as Record<string, number>;
}

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set (run with --env-file=.env)");
  await mongoose.connect(uri);
  out(APPLY ? "APPLY: clearing traces of erased accounts" : "DRY RUN: counts only (add --apply to clear)");

  const scope = onlyUsers.length ? { _id: { $in: onlyUsers.map((id) => new mongoose.Types.ObjectId(id)) } } : {};
  const erased = (await User.find({ ...scope, email: ERASED_EMAIL }).select("_id email").lean()) as Array<{ _id: unknown; email: string }>;
  out(`Erased accounts: ${erased.length}`);

  const totals: Record<string, number> = {};
  let accountsWithTraces = 0;
  for (const user of erased) {
    const userId = String(user._id);
    const seeker = (await JobSeeker.findOne({ userId: user._id }).select("_id").lean()) as Row | null;
    const seekerId = seeker?._id;
    const applicationIds = seekerId ? await ids(Application, { jobSeekerId: seekerId }) : [];
    const [offerIds, interviewIds, placementIds] = seekerId
      ? await Promise.all([ids(Offer, { jobSeekerId: seekerId }), ids(Interview, { jobSeekerId: seekerId }), ids(Placement, { jobSeekerId: seekerId })])
      : [[], [], []];
    const identity = await recoverIdentity(userId, applicationIds, offerIds, interviewIds, placementIds, seekerId ?? null);
    const counts = await countTraces(userId, seekerId ?? null, applicationIds, offerIds, interviewIds, identity.emails);
    const found = Object.entries(counts).filter(([, n]) => n > 0);
    if (found.length === 0) continue;
    accountsWithTraces++;
    for (const [label, n] of found) totals[label] = (totals[label] ?? 0) + n;
    out(`  ${seekerId ? "seeker" : "account"} ${userId}: ${found.map(([label, n]) => `${label}=${n}`).join(" ")} (names recovered: ${identity.names.length}, addresses: ${identity.emails.length})`);
    if (!APPLY) continue;

    for (const email of identity.emails.length ? identity.emails : [null]) await eraseEmailLog(userId, email);
    if (!seekerId) continue;
    await Application.updateMany({ jobSeekerId: seekerId }, { $unset: Object.fromEntries(ERASED_APPLICATION_FIELDS.map((field) => [field, 1])) });
    await scrubApplicationTraces({ jobSeekerId: seekerId });
    const files: string[] = [];
    // One pass per recovered address (referrals are matched by it); names apply to every pass.
    for (const email of identity.emails.length ? identity.emails : [null]) {
      files.push(...(await eraseSeekerHiringTraces({ userId, seekerId, applicationIds, names: identity.names, email, anonymizedEmail: user.email })));
    }
    for (const url of new Set(files)) {
      try {
        await deleteFile(url);
      } catch (err) {
        out(`    could not delete a referred CV file: ${(err as Error).message}`);
      }
    }
  }

  out(`Accounts with traces: ${accountsWithTraces}`);
  out(`Totals: ${Object.entries(totals).map(([label, n]) => `${label}=${n}`).join(" ") || "none"}`);
  if (APPLY) out("Done. Run again without --apply: every count should be gone.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
