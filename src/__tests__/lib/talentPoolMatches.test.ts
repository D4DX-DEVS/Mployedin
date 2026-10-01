/**
 * @jest-environment node
 *
 * matchTalentPoolForJob wiring: who is in the pool, that no AI is called, and
 * that the shown score is the employer-side applicant score.
 */
const JOB_ID = "64a000000000000000000010";

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = jest.fn(() => c);
  c.populate = jest.fn(() => c);
  c.limit = jest.fn(() => c);
  c.sort = jest.fn(() => c);
  c.distinct = jest.fn(async () => visibleIds);
  c.lean = jest.fn(async () => value);
  return c;
};

const jobDoc = { _id: JOB_ID, title: "Staff Nurse", employerId: "emp1", updatedAt: new Date("2026-10-01T00:00:00Z") };
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => lean(jobDoc)) } }));
jest.mock("@/models/Employer", () => {
  const model = { findById: jest.fn(() => lean({ matchingWeights: { skills: 50 }, industry: "Healthcare" })) };
  return { __esModule: true, Employer: model, default: model };
});
const distinct = jest.fn(async () => ["applied1"]);
jest.mock("@/models/Application", () => ({ __esModule: true, default: { distinct: (...a: unknown[]) => distinct(...(a as [])) } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

const seekers = [
  { _id: "s1", fullName: "Asha", userId: { _id: "u1", name: "Asha", isActive: true }, skills: ["ICU"], experience: [{ jobTitle: "Nurse", company: "City Hospital", isCurrent: true }] },
  { _id: "s2", fullName: "Bilal", userId: { _id: "u2", name: "Bilal", isActive: true }, skills: [] },
  { _id: "s3", fullName: "Gone", userId: { _id: "u3", isActive: false }, skills: ["ICU"] },
  { _id: "s4", fullName: "Orphan", userId: null, skills: ["ICU"] },
];
let visibleIds = ["s1", "s2", "s3", "s4"];
const seekerQuery = lean(seekers);
const find = jest.fn(() => seekerQuery);
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { find: (...a: unknown[]) => find(...(a as [])) } }));

jest.mock("@/lib/effectiveSeekerProfile", () => ({
  loadConfirmedSkills: jest.fn(async () => new Map()),
  withConfirmedSkills: (p: unknown) => p,
}));
const loadSkillVectors = jest.fn(async () => new Map());
jest.mock("@/lib/matching/skillVectors", () => ({
  collectSkillVocabulary: () => ["ICU"],
  loadSkillVectors: (...a: unknown[]) => loadSkillVectors(...(a as [])),
}));
const scorePair = jest.fn();
jest.mock("@/lib/matching/recommend", () => ({
  toCandidateJob: (job: unknown) => ({ job }),
  scorePair: (...a: unknown[]) => scorePair(...a),
}));
jest.mock("@/lib/matching/seekerMatches", () => ({
  resolveEngineOptions: jest.fn(async () => ({ threshold: 80, useAi: true, verdicts: {} })),
}));
const computeApplicantMatch = jest.fn();
jest.mock("@/lib/matching/scoreApplication", () => ({
  APPLICANT_JOB_FIELDS: "title requirements",
  APPLICANT_SEEKER_FIELDS: "skills userId",
  computeApplicantMatch: (...a: unknown[]) => computeApplicantMatch(...a),
}));

import { matchTalentPoolForJob } from "@/lib/matching/talentPoolMatches";

beforeEach(() => {
  scorePair.mockImplementation(async (profile: { skills: string[] }) =>
    profile.skills.length ? { eligible: true, score: 70 } : { eligible: false, reason: "country", score: 30 },
  );
  computeApplicantMatch.mockImplementation(async ({ seeker }: { seeker: { _id: string } }) => ({
    aiMatchScore: seeker._id === "s1" ? 88 : 41,
    matchBreakdown: { skills: 90, role: 80, experience: 100, overall: 88 },
    matchedSkills: ["ICU"],
    missingSkills: [],
    qualifications: [{ key: "experience", status: "not_met", hard: seeker._id === "s2", required: "3", actual: "0" }],
    requirementsStatus: seeker._id === "s2" ? "not_met" : "met",
  }));
});

it("ranks only discoverable candidates who have not applied, with AI switched off", async () => {
  const result = await matchTalentPoolForJob(JOB_ID);
  expect(find).toHaveBeenCalledWith({ profileVisibility: "visible", roleArchivedAt: null, _id: { $nin: ["applied1"] } });
  expect(distinct).toHaveBeenCalledWith("jobSeekerId", { jobId: JOB_ID });

  // Deactivated and orphaned accounts never reach the list.
  expect(result!.poolSize).toBe(2);
  expect(result!.alreadyApplied).toBe(1);
  expect(result!.candidates.map((c) => c.jobSeekerId)).toEqual(["s1", "s2"]);

  for (const call of scorePair.mock.calls) expect(call[2]).toMatchObject({ useAi: false });
  // The whole-pool pass never calls the embedder.
  expect(loadSkillVectors).toHaveBeenCalledWith(["ICU"], { allowEmbedding: false });
  for (const call of computeApplicantMatch.mock.calls) {
    expect(call[0]).toMatchObject({ engine: { useAi: false }, employerIndustry: "Healthcare", employerWeights: { skills: 50 } });
  }
});

it("shows the employer-side score, the unmet hard requirements and the candidate's own preference clash", async () => {
  const result = await matchTalentPoolForJob(JOB_ID);
  const [asha, bilal] = result!.candidates;
  expect(asha).toMatchObject({
    name: "Asha",
    score: 88,
    preferenceMismatch: null,
    unmetRequirements: [],
    latestRole: { title: "Nurse", company: "City Hospital" },
  });
  expect(bilal).toMatchObject({
    score: 41,
    preferenceMismatch: "country",
    requirementsStatus: "not_met",
    unmetRequirements: [{ key: "experience", required: "3", actual: "0" }],
  });
});

it("returns null for a job that does not exist", async () => {
  const Job = jest.requireMock("@/models/Job").default as { findById: jest.Mock };
  Job.findById.mockReturnValueOnce(lean(null));
  expect(await matchTalentPoolForJob("64a000000000000000000099")).toBeNull();
});

it("drops a candidate who hid their profile after the ranking was cached", async () => {
  visibleIds = ["s2"];
  const result = await matchTalentPoolForJob(JOB_ID);
  expect(result!.candidates.map((c) => c.jobSeekerId)).toEqual(["s2"]);
  visibleIds = ["s1", "s2", "s3", "s4"];
});

it("shares one computation between concurrent first views", async () => {
  const Job = jest.requireMock("@/models/Job").default as { findById: jest.Mock };
  Job.findById.mockReturnValue(lean({ ...jobDoc, updatedAt: new Date("2026-10-02T00:00:00Z") }));
  computeApplicantMatch.mockClear();
  await Promise.all([matchTalentPoolForJob(JOB_ID), matchTalentPoolForJob(JOB_ID)]);
  // Two shortlisted candidates, scored once — not once per request.
  expect(computeApplicantMatch).toHaveBeenCalledTimes(2);
});
