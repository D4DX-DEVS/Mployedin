/**
 * @jest-environment node
 *
 * When a seeker's account is erased, the employer's hiring records stay (status,
 * dates, scores), but nothing in them may still name or describe the person.
 * These are the copies the first erasure missed (verified 2026-11-16):
 * status-history notes (bulk reject copies the rejection reason there), CV
 * quotes in the requirement check, interview feedback and the candidate's own
 * notes, offer notes and the e-signature IP, names cached on AI interview
 * questions, offer letters and referrals, the employer's bell, seeker-written
 * feedback, and the email log (that one for every role).
 */
const USER_ID = "64e000000000000000000001";
const SEEKER_ID = "64e0000000000000000000aa";
const APP_ID = "64e0000000000000000000a1";
const OFFER_ID = "64e0000000000000000000b1";
const INTERVIEW_ID = "64e0000000000000000000c1";
const PLACEMENT_ID = "64e0000000000000000000d1";
const ANON = `deleted_${USER_ID}@anonymized.mployedin.com`;

const found = (rows: unknown[]) => ({ select: () => ({ lean: async () => rows }), lean: async () => rows });

const appUpdateMany = jest.fn();
const interviewFind = jest.fn();
const interviewUpdateMany = jest.fn();
const questionUpdateMany = jest.fn();
const offerFind = jest.fn();
const offerUpdateMany = jest.fn();
const letterFind = jest.fn();
const letterBulkWrite = jest.fn();
const referralFind = jest.fn();
const referralUpdateMany = jest.fn();
const notificationFind = jest.fn();
const notificationBulkWrite = jest.fn();
const placementFind = jest.fn();
const placementUpdateMany = jest.fn();
const scorecardUpdateMany = jest.fn();
const feedbackUpdateMany = jest.fn();
const npsUpdateMany = jest.fn();
const surveyUpdateMany = jest.fn();
const attemptUpdateMany = jest.fn();
const emailLogDeleteMany = jest.fn();
const mirrorLogErase = jest.fn();

// A function declaration (hoisted, unlike the jest.mock factories it serves), and each mock looked up when
// called: the factories run on import, before the consts above are initialised.
function model(impl: Record<string, () => jest.Mock>) {
  return {
    __esModule: true,
    default: Object.fromEntries(Object.entries(impl).map(([k, get]) => [k, (...a: unknown[]) => get()(...a)])),
  };
}
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Application", () => model({ updateMany: () => appUpdateMany }));
jest.mock("@/models/Interview", () => model({ find: () => interviewFind, updateMany: () => interviewUpdateMany }));
jest.mock("@/models/InterviewQuestion", () => model({ updateMany: () => questionUpdateMany }));
jest.mock("@/models/Offer", () => model({ find: () => offerFind, updateMany: () => offerUpdateMany }));
jest.mock("@/models/OfferLetter", () => model({ find: () => letterFind, bulkWrite: () => letterBulkWrite }));
jest.mock("@/models/EmployeeReferral", () => model({ find: () => referralFind, updateMany: () => referralUpdateMany }));
jest.mock("@/models/Notification", () => model({ find: () => notificationFind, bulkWrite: () => notificationBulkWrite }));
jest.mock("@/models/Placement", () => model({ find: () => placementFind, updateMany: () => placementUpdateMany }));
jest.mock("@/models/Scorecard", () => model({ updateMany: () => scorecardUpdateMany }));
jest.mock("@/models/ApplicationFeedback", () => model({ updateMany: () => feedbackUpdateMany }));
jest.mock("@/models/CandidateNPS", () => ({ __esModule: true, CandidateNPS: { updateMany: (...a: unknown[]) => npsUpdateMany(...a) } }));
jest.mock("@/models/CandidateSurvey", () => ({ __esModule: true, SurveyResponse: { updateMany: (...a: unknown[]) => surveyUpdateMany(...a) } }));
jest.mock("@/models/AssessmentAttempt", () => model({ updateMany: () => attemptUpdateMany }));
jest.mock("@/models/EmailLog", () => model({ deleteMany: () => emailLogDeleteMany }));
jest.mock("@/lib/logs/logStore", () => ({ mirrorLogErase: (...a: unknown[]) => mirrorLogErase(...a) }));

import { eraseEmailLog, eraseSeekerHiringTraces, redactPersonText, scrubApplicationTraces } from "@/lib/gdpr/hiringTraces";

const SUBJECT = {
  userId: USER_ID,
  seekerId: SEEKER_ID,
  applicationIds: [APP_ID],
  names: ["Sara Al Amin", "Sara"],
  email: "Sara.Amin@example.com",
  anonymizedEmail: ANON,
};

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of [appUpdateMany, interviewUpdateMany, questionUpdateMany, offerUpdateMany, referralUpdateMany, placementUpdateMany,
    scorecardUpdateMany, feedbackUpdateMany, npsUpdateMany, surveyUpdateMany, attemptUpdateMany]) fn.mockResolvedValue({ modifiedCount: 1 });
  emailLogDeleteMany.mockResolvedValue({ deletedCount: 2 });
  letterBulkWrite.mockResolvedValue({});
  notificationBulkWrite.mockResolvedValue({});
  mirrorLogErase.mockResolvedValue(undefined);
  interviewFind.mockReturnValue(found([{ _id: INTERVIEW_ID }]));
  offerFind.mockReturnValue(found([{ _id: OFFER_ID }]));
  placementFind.mockReturnValue(found([{ _id: PLACEMENT_ID }]));
  letterFind.mockReturnValue(found([]));
  referralFind.mockReturnValue(found([]));
  notificationFind.mockReturnValue(found([]));
});

describe("redactPersonText", () => {
  it("replaces every name (any case, longest first) and the email, and leaves other text alone", () => {
    expect(redactPersonText("Offer for SARA AL AMIN (sara.amin@example.com). Sara accepted.", SUBJECT.names, SUBJECT.email, ANON))
      .toBe(`Offer for Deleted User (${ANON}). Deleted User accepted.`);
  });

  it("replaces the URL-encoded name in links", () => {
    expect(redactPersonText("/admin/placements?search=Sara%20Al%20Amin", SUBJECT.names, null, ANON)).toBe("/admin/placements?search=Deleted%20User");
  });

  it("does not touch a word that only contains the name", () => {
    expect(redactPersonText("Saratoga office", ["Sara"], null, ANON)).toBe("Saratoga office");
  });

  it("ignores blank names and the placeholder itself, so a retry changes nothing", () => {
    expect(redactPersonText("Deleted User moved", ["", "  ", "Deleted User"], null, ANON)).toBe("Deleted User moved");
  });
});

describe("scrubApplicationTraces", () => {
  it("clears status-history notes and CV quotes only where those arrays exist (a missing array fails a $[] update)", async () => {
    await scrubApplicationTraces({ jobSeekerId: SEEKER_ID });
    expect(appUpdateMany).toHaveBeenCalledWith(
      { jobSeekerId: SEEKER_ID, "statusHistory.0": { $exists: true } },
      { $unset: { "statusHistory.$[].note": 1 } },
    );
    expect(appUpdateMany).toHaveBeenCalledWith(
      { jobSeekerId: SEEKER_ID, "qualifications.0": { $exists: true } },
      { $unset: { "qualifications.$[].actual": 1 } },
    );
  });
});

describe("eraseSeekerHiringTraces", () => {
  it("clears interview feedback, the candidate's reschedule note and the email answer link, and the name on AI questions", async () => {
    await eraseSeekerHiringTraces(SUBJECT);
    expect(interviewFind).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
    expect(interviewUpdateMany).toHaveBeenCalledWith(
      { jobSeekerId: SEEKER_ID },
      { $unset: { feedback: 1, candidateRescheduleNote: 1, responseToken: 1 } },
    );
    expect(questionUpdateMany).toHaveBeenCalledWith(
      { interviewId: { $in: [INTERVIEW_ID] }, candidateName: { $exists: true } },
      { $set: { candidateName: "Deleted User" } },
    );
  });

  it("clears the candidate's offer notes and signature IP, keeps the typed signature, and renames them in the timeline", async () => {
    await eraseSeekerHiringTraces(SUBJECT);
    expect(offerUpdateMany).toHaveBeenCalledWith(
      { jobSeekerId: SEEKER_ID },
      { $unset: { declineReason: 1, "counterOffer.note": 1, "signature.ip": 1 } },
    );
    expect(offerUpdateMany).toHaveBeenCalledWith(
      { jobSeekerId: SEEKER_ID, "events.actorRole": "job_seeker" },
      { $set: { "events.$[e].actorName": "Deleted User" }, $unset: { "events.$[e].note": 1 } },
      { arrayFilters: [{ "e.actorRole": "job_seeker" }] },
    );
    const unset = offerUpdateMany.mock.calls[0][1].$unset as Record<string, unknown>;
    expect(unset).not.toHaveProperty("signature.fullName");
  });

  it("clears staff notes on scorecards and placements", async () => {
    await eraseSeekerHiringTraces(SUBJECT);
    expect(scorecardUpdateMany).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID }, { $unset: { notes: 1 } });
    expect(placementUpdateMany).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID }, { $unset: { notes: 1 } });
  });

  it("rewrites offer letters: name, email, the letter text and its variables; drops the signature", async () => {
    letterFind.mockReturnValue(found([{
      _id: "L1",
      content: "Dear Sara Al Amin, we are pleased…",
      variableValues: { candidate_name: "Sara Al Amin", salary: "5000" },
    }]));
    await eraseSeekerHiringTraces(SUBJECT);
    expect(letterFind).toHaveBeenCalledWith({ offerId: { $in: [OFFER_ID] } });
    expect(letterBulkWrite).toHaveBeenCalledWith([{
      updateOne: {
        filter: { _id: "L1" },
        update: {
          $set: {
            candidateName: "Deleted User",
            candidateEmail: ANON,
            content: "Dear Deleted User, we are pleased…",
            variableValues: { candidate_name: "Deleted User", salary: "5000" },
          },
          $unset: { signatureData: 1, signatureIp: 1, declineReason: 1 },
        },
      },
    }]);
  });

  it("anonymises referrals of this person, by application or by their email in any case, and returns the CV file to delete", async () => {
    referralFind.mockReturnValue(found([{ _id: "R1", candidateResumeUrl: "https://s3/referrals/cv.pdf" }]));
    const files = await eraseSeekerHiringTraces(SUBJECT);
    const filter = referralFind.mock.calls[0][0] as { $or: Array<Record<string, unknown>> };
    expect(filter.$or[0]).toEqual({ applicationId: { $in: [APP_ID] } });
    const emailRe = (filter.$or[1].candidateEmail as RegExp);
    expect(emailRe.test("sara.amin@EXAMPLE.com")).toBe(true);
    expect(emailRe.test("xsara.amin@example.com")).toBe(false);
    expect(referralUpdateMany).toHaveBeenCalledWith(
      { _id: { $in: ["R1"] } },
      { $set: { candidateName: "Deleted User", candidateEmail: ANON }, $unset: { candidatePhone: 1, candidateResumeUrl: 1, notes: 1 } },
    );
    expect(files).toEqual(["https://s3/referrals/cv.pdf"]);
  });

  it("renames the person on other users' notifications about their applications, offers and placements", async () => {
    notificationFind.mockReturnValue(found([{
      _id: "N1",
      title: "Application stage changed",
      body: "Sara Al Amin's application for \"Chef\" moved to interview.",
      actionUrl: "/admin/placements?search=Sara%20Al%20Amin",
      meta: { applicationId: APP_ID, params: { candidateName: "Sara Al Amin", jobTitle: "Chef" }, candidateName: "Sara Al Amin" },
    }]));
    await eraseSeekerHiringTraces(SUBJECT);
    const filter = notificationFind.mock.calls[0][0] as { userId: unknown; $or: Array<Record<string, { $in: unknown[] }>> };
    expect(filter.userId).toEqual({ $ne: USER_ID });
    const keys = filter.$or.map((c) => Object.keys(c)[0]);
    expect(keys).toEqual(["meta.applicationId", "meta.offerId", "meta.placementId", "meta.jobSeekerId"]);
    expect(filter.$or[0]["meta.applicationId"].$in.map(String)).toContain(APP_ID);
    expect(notificationBulkWrite).toHaveBeenCalledWith([{
      updateOne: {
        filter: { _id: "N1" },
        update: {
          $set: {
            title: "Application stage changed",
            body: "Deleted User's application for \"Chef\" moved to interview.",
            actionUrl: "/admin/placements?search=Deleted%20User",
            meta: { applicationId: APP_ID, params: { candidateName: "Deleted User", jobTitle: "Chef" }, candidateName: "Deleted User" },
          },
        },
      },
    }]);
  });

  it("names the person on a notification even when the stored name is no longer known (a retried erasure)", async () => {
    notificationFind.mockReturnValue(found([{ _id: "N2", title: "t", body: "b", meta: { params: { seekerName: "Old Name" } } }]));
    await eraseSeekerHiringTraces({ ...SUBJECT, names: ["Deleted User"] });
    const update = notificationBulkWrite.mock.calls[0][0][0].updateOne.update.$set;
    expect(update.meta.params.seekerName).toBe("Deleted User");
  });

  it("removes what the seeker wrote in feedback, NPS, surveys and assessments, keeping ratings and scores", async () => {
    await eraseSeekerHiringTraces(SUBJECT);
    expect(feedbackUpdateMany).toHaveBeenCalledWith({ userId: USER_ID }, { $unset: { comment: 1 } });
    expect(npsUpdateMany).toHaveBeenCalledWith({ candidateId: SEEKER_ID }, { $unset: { comment: 1 } });
    expect(surveyUpdateMany).toHaveBeenCalledWith({ candidateId: USER_ID }, [
      { $set: { answers: { $filter: { input: { $ifNull: ["$answers", []] }, cond: { $isNumber: "$$this.value" } } } } },
      { $unset: "comment" },
    ], { updatePipeline: true });
    expect(attemptUpdateMany).toHaveBeenCalledWith(
      { userId: USER_ID, "answers.0": { $exists: true } },
      { $unset: { "answers.$[].answer": 1 } },
    );
  });

  it("skips the email lookup for referrals when the address is already gone", async () => {
    await eraseSeekerHiringTraces({ ...SUBJECT, email: null });
    expect((referralFind.mock.calls[0][0] as { $or: unknown[] }).$or).toHaveLength(1);
  });

  it("fails loudly so the request stays open for a retry", async () => {
    offerUpdateMany.mockRejectedValue(new Error("db down"));
    await expect(eraseSeekerHiringTraces(SUBJECT)).rejects.toThrow("db down");
  });
});

describe("eraseEmailLog (every role)", () => {
  it("deletes the rows sent to them, by account or by address in any case, here and in the D1 copy", async () => {
    await eraseEmailLog(USER_ID, "Sara.Amin@example.com");
    const filter = emailLogDeleteMany.mock.calls[0][0] as { $or: Array<Record<string, unknown>> };
    expect(filter.$or[0]).toEqual({ userId: USER_ID });
    expect((filter.$or[1].to as RegExp).test("SARA.AMIN@example.com")).toBe(true);
    expect((filter.$or[1].to as RegExp).test("x.sara.amin@example.com")).toBe(false);
    expect(mirrorLogErase).toHaveBeenCalledWith("email_log", "user_id", [USER_ID]);
    expect(mirrorLogErase).toHaveBeenCalledWith("email_log", "to_address", ["Sara.Amin@example.com", "sara.amin@example.com"]);
  });

  it("goes by account only when the address is already gone", async () => {
    await eraseEmailLog(USER_ID, null);
    expect(emailLogDeleteMany).toHaveBeenCalledWith({ $or: [{ userId: USER_ID }] });
    expect(mirrorLogErase).toHaveBeenCalledTimes(1);
  });
});
