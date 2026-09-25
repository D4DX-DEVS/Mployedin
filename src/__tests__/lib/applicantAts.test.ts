/**
 * The employer's ATS view of one applicant: requirements checklist,
 * deal-breaker screening answers and the employer-weighted ranking score.
 *
 * The regression these pin: a candidate with every skill and one year of
 * experience scored 86 against a 5–8 year job, and nothing told the employer
 * the experience requirement had failed.
 */
import { seekerProfileFromDoc, type JobProfile, type SeekerProfile } from "@/lib/matchScore";
import { mergeCvIntoSeeker, normalizeParsedCv, type ApplicantCv } from "@/lib/cv/parsedCv";
import { calculateRelevance } from "@/lib/matching/relevance";
import { evaluateQualifications, requirementsStatusOf } from "@/lib/matching/qualifications";
import {
  evaluateKnockout,
  knockoutRuleOf,
  mergeScreeningKnockouts,
  splitScreeningQuestions,
} from "@/lib/matching/knockouts";
import { buildApplicantMatch, employerExperienceFit, weightedApplicantScore } from "@/lib/matching/applicantScore";
import type { PairScore } from "@/lib/matching/recommend";
import { DEFAULT_WEIGHTS } from "@/lib/ai/matchingWeights";

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: ["React", "Node.js", "MongoDB", "AWS"],
    location: "united arab emirates",
    locations: ["united arab emirates"],
    experienceYears: 6,
    experienceKnown: true,
    salaryExpectation: 0,
    salaryCurrency: "",
    jobType: "any",
    preferredRoles: ["full stack developer"],
    educationLevel: 3,
    city: "",
    cities: [],
    cvText: "",
    roleHistory: [],
    ...overrides,
  };
}

function job(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    skills: ["React", "Node.js", "MongoDB", "AWS"],
    preferredSkills: [],
    location: "united arab emirates",
    city: "",
    remote: false,
    salaryMin: 0,
    salaryMax: 0,
    salaryPeriod: "monthly",
    salaryCurrency: "",
    minExp: 5,
    maxExp: 8,
    title: "senior full stack developer",
    workMode: "",
    requiredEducationLevel: 3,
    ...overrides,
  };
}

function pairFor(s: SeekerProfile, j: JobProfile, extra: Partial<PairScore> = {}): PairScore {
  const breakdown = calculateRelevance(s, j);
  return { eligible: true, score: breakdown.overall, breakdown, ...extra };
}

const check = (s: SeekerProfile, j: JobProfile, extra = {}) =>
  evaluateQualifications({ seeker: s, job: j, relevance: calculateRelevance(s, j), ...extra });

describe("requirements checklist", () => {
  it("flags the 1-year candidate a 5–8 year job would have scored 86", () => {
    const s = seeker({ experienceYears: 1 });
    const result = check(s, job());
    expect(calculateRelevance(s, job()).overall).toBeGreaterThanOrEqual(80);
    expect(result.checks.find((c) => c.key === "experience")).toMatchObject({
      status: "not_met",
      hard: true,
      required: "5",
      actual: "1",
    });
    expect(result.status).toBe("not_met");
  });

  it("treats a candidate within a year of the minimum as close, not failed", () => {
    const result = check(seeker({ experienceYears: 4.5 }), job());
    expect(result.checks.find((c) => c.key === "experience")?.status).toBe("partial");
    expect(result.status).toBe("met");
  });

  it("reports unstated experience as unverified, never as a pass or a fail", () => {
    const result = check(seeker({ experienceKnown: false, experienceYears: 0 }), job());
    expect(result.checks.find((c) => c.key === "experience")?.status).toBe("unknown");
    expect(result.status).toBe("unverified");
  });

  it("fails education two levels short, is close one level short, unknown when none listed", () => {
    expect(check(seeker({ educationLevel: 1 }), job()).checks.find((c) => c.key === "education")?.status).toBe("not_met");
    expect(check(seeker({ educationLevel: 2 }), job()).checks.find((c) => c.key === "education")?.status).toBe("partial");
    expect(check(seeker({ educationLevel: 0 }), job()).checks.find((c) => c.key === "education")?.status).toBe("unknown");
  });

  it("shows an onsite job abroad as a soft mismatch that never blocks the shortlist", () => {
    const result = check(seeker({ locations: ["india"], location: "india" }), job());
    expect(result.checks.find((c) => c.key === "location")).toMatchObject({ status: "not_met", hard: false });
    expect(result.status).toBe("met");
  });

  it("makes a remote job's hiring countries a hard requirement", () => {
    const remote = job({ remote: true, remoteScope: "countries", remoteCountries: ["united arab emirates"] });
    const result = check(seeker({ locations: ["india"], location: "india" }), remote);
    expect(result.checks.find((c) => c.key === "location")).toMatchObject({ status: "not_met", hard: true });
    expect(result.status).toBe("not_met");
  });

  it("omits checks for requirements the job never stated", () => {
    const result = check(seeker(), job({ minExp: 0, requiredEducationLevel: 0 }));
    expect(result.checks.map((c) => c.key)).not.toContain("experience");
    expect(result.checks.map((c) => c.key)).not.toContain("education");
  });

  it("counts skills coverage and lists salary and work mode as information only", () => {
    const s = seeker({ skills: ["React"], salaryExpectation: 15000, salaryCurrency: "AED", jobType: "remote" });
    const j = job({ salaryMin: 8000, salaryMax: 10000, salaryCurrency: "AED", workMode: "onsite" });
    const result = check(s, j);
    expect(result.checks.find((c) => c.key === "skills")).toMatchObject({ status: "not_met", required: "4", actual: "1", hard: false });
    expect(result.checks.find((c) => c.key === "salary")).toMatchObject({ status: "not_met", hard: false });
    expect(result.checks.find((c) => c.key === "work_mode")).toMatchObject({ status: "not_met", hard: false });
    expect(result.status).toBe("met");
  });

  it("checks required languages case-insensitively", () => {
    const result = check(seeker(), job(), { seekerLanguages: ["english"], jobLanguages: ["English", "Arabic"] });
    expect(result.checks.find((c) => c.key === "languages")).toMatchObject({ status: "partial", actual: "English" });
  });

  it("rolls up: any hard failure wins over unknowns", () => {
    expect(
      requirementsStatusOf([
        { key: "experience", status: "unknown", hard: true },
        { key: "education", status: "not_met", hard: true },
      ]),
    ).toBe("not_met");
  });
});

describe("deal-breaker screening questions", () => {
  const licence = {
    id: "q1",
    label: "Valid UAE driving licence?",
    type: "radio",
    required: false,
    options: ["Yes", "No"],
    knockout: true,
    acceptedAnswers: ["Yes"],
  };
  const gccYears = { id: "q2", label: "Years in GCC?", type: "number", knockout: true, minValue: 2 };

  it("splits private rules from public questions and forces knockouts to required", () => {
    const { questions, knockouts } = splitScreeningQuestions([licence, gccYears]);
    expect(questions[0]).not.toHaveProperty("acceptedAnswers");
    expect(questions[0]).not.toHaveProperty("knockout");
    expect(questions[1]).not.toHaveProperty("minValue");
    expect(questions.every((q) => q.required)).toBe(true);
    expect(knockouts).toEqual([
      { questionId: "q1", acceptedAnswers: ["Yes"] },
      { questionId: "q2", minValue: 2 },
    ]);
  });

  it("merges rules back for the owner's editor", () => {
    const { questions, knockouts } = splitScreeningQuestions([licence, gccYears]);
    const merged = mergeScreeningKnockouts(questions, knockouts);
    expect(merged[0]).toMatchObject({ knockout: true, acceptedAnswers: ["Yes"] });
    expect(merged[1]).toMatchObject({ knockout: true, minValue: 2 });
  });

  it("drops a knockout with nothing valid to check against", () => {
    expect(knockoutRuleOf({ ...licence, acceptedAnswers: ["Maybe"] })).toBeNull();
    expect(knockoutRuleOf({ ...gccYears, minValue: undefined })).toBeNull();
    expect(knockoutRuleOf({ id: "q3", label: "Why us?", type: "textarea", knockout: true })).toBeNull();
  });

  it("evaluates option, multi-select and number answers", () => {
    expect(evaluateKnockout({ questionId: "q1", acceptedAnswers: ["Yes"] }, "yes ")).toBe("met");
    expect(evaluateKnockout({ questionId: "q1", acceptedAnswers: ["Yes"] }, "No")).toBe("not_met");
    expect(evaluateKnockout({ questionId: "q1", acceptedAnswers: ["UAE", "GCC"] }, ["India", "GCC"])).toBe("met");
    expect(evaluateKnockout({ questionId: "q2", minValue: 2 }, "3")).toBe("met");
    expect(evaluateKnockout({ questionId: "q2", minValue: 2 }, 1)).toBe("not_met");
    expect(evaluateKnockout({ questionId: "q2", minValue: 2 }, "")).toBe("unknown");
    expect(evaluateKnockout({ questionId: "q1", acceptedAnswers: ["Yes"] }, true)).toBe("met");
  });

  it("fails the requirements checklist on a wrong deal-breaker answer", () => {
    const { questions, knockouts } = splitScreeningQuestions([licence]);
    const result = check(seeker(), job(), { knockouts, questions, answers: [{ questionId: "q1", answer: "No" }] });
    expect(result.checks.find((c) => c.key === "screening")).toMatchObject({
      status: "not_met",
      hard: true,
      label: "Valid UAE driving licence?",
      actual: "No",
    });
    expect(result.status).toBe("not_met");
  });

  it("leaves a talent-pool candidate who never answered unverified", () => {
    const { questions, knockouts } = splitScreeningQuestions([licence]);
    expect(check(seeker(), job(), { knockouts, questions }).status).toBe("unverified");
  });
});

describe("employer-weighted ranking score", () => {
  it("ranks with the standard weights when the employer saved none, and keeps the seeker's number apart", () => {
    const s = seeker();
    const j = job();
    const pair = pairFor(s, j);
    const match = buildApplicantMatch({ pair, seeker: s, job: j, weights: null });
    const withDefaults = buildApplicantMatch({ pair, seeker: s, job: j, weights: DEFAULT_WEIGHTS });
    expect(match.aiMatchScore).toBe(withDefaults.aiMatchScore);
    expect(match.seekerMatchScore).toBe(pair.score);
    expect(match.matchBreakdown.overall).toBe(match.aiMatchScore);
    expect(match.weightsApplied).toBe(false);
    expect(withDefaults.weightsApplied).toBe(true);
  });

  it("re-weights the parts when weights are saved, and keeps the seeker's number apart", () => {
    // Weak on skills, strong on experience: an employer who weights experience
    // heavily should rank this candidate higher than the engine does.
    const s = seeker({ skills: ["React"] });
    const j = job({ requiredEducationLevel: 0 });
    const pair = pairFor(s, j);
    const experienceFirst = { skills: 10, experience: 80, education: 0, industryExperience: 10, preferredQualifications: 0 };
    const match = buildApplicantMatch({ pair, seeker: s, job: j, weights: experienceFirst });
    expect(match.weightsApplied).toBe(true);
    expect(match.aiMatchScore).toBeGreaterThan(pair.score);
    expect(match.seekerMatchScore).toBe(pair.score);
    expect(match.matchBreakdown.overall).toBe(match.aiMatchScore);
  });

  it("drops parts the job gives no basis for and renormalises the rest", () => {
    const parts = { skills: 100, preferred: null, experience: 100, role: 100, education: null };
    expect(weightedApplicantScore(parts, DEFAULT_WEIGHTS)).toBe(100);
    // Preferred drops out (5 of 100): education's 15 weighs 15/95 of the score.
    expect(weightedApplicantScore({ ...parts, education: 0 }, DEFAULT_WEIGHTS)).toBe(Math.round((80 / 95) * 100));
  });

  it("credits a past role with the same title for industry experience", () => {
    const s = seeker({ preferredRoles: [], roleHistory: [{ title: "Full Stack Developer", years: 4 }] });
    const j = job();
    const pair = pairFor(s, j);
    const industryOnly = { skills: 0, experience: 0, education: 0, industryExperience: 100, preferredQualifications: 0 };
    expect(buildApplicantMatch({ pair, seeker: s, job: j, weights: industryOnly }).aiMatchScore).toBe(90);
  });

  it("applies Jev's verdict within the same ±10 the engine allows", () => {
    const s = seeker({ skills: ["React"] });
    const j = job({ requiredEducationLevel: 0 });
    const pair = pairFor(s, j, { aiConfidence: 1 });
    const w = { skills: 10, experience: 80, education: 0, industryExperience: 10, preferredQualifications: 0 };
    const withoutJev = buildApplicantMatch({ pair: { ...pair, aiConfidence: undefined }, seeker: s, job: j, weights: w });
    const withJev = buildApplicantMatch({ pair, seeker: s, job: j, weights: w });
    expect(withJev.aiMatchScore - withoutJev.aiMatchScore).toBeGreaterThan(0);
    expect(withJev.aiMatchScore - withoutJev.aiMatchScore).toBeLessThanOrEqual(10);
  });
});

describe("employer ATS: every requirement counts", () => {
  const TEN = [
    "Sales Strategy", "Distribution Management", "Channel Sales", "General Trade", "Modern Trade",
    "Trade Marketing", "Team Leadership", "Business Development", "FMCG", "Key Account Management",
  ];

  it("scores all required skills, not the first six the seeker engine uses", () => {
    // Everything this candidate has sits past the sixth skill.
    const s = seeker({ skills: ["Team Leadership", "Business Development", "FMCG", "Key Account Management"] });
    const j = job({ skills: TEN, requiredEducationLevel: 0, minExp: 0, maxExp: 30 });
    const relevance = calculateRelevance(s, j);
    expect(relevance.skills).toBe(0);
    expect(relevance.requiredCoverage).toBe(40);
    expect(relevance.requiredMatched).toEqual(["Team Leadership", "Business Development", "FMCG", "Key Account Management"]);
    expect(relevance.requiredMissing).toHaveLength(6);

    const match = buildApplicantMatch({ pair: pairFor(s, j), seeker: s, job: j, weights: null });
    expect(match.matchBreakdown.skills).toBe(40);
    expect(match.matchedSkills).toHaveLength(4);
    expect(match.missingSkills).toHaveLength(6);
    expect(match.qualifications.find((c) => c.key === "skills")).toMatchObject({ required: "10", actual: "4" });
  });

  it("marks down too much experience gently, too little as before", () => {
    expect(employerExperienceFit(10, true, 8, 20)).toBe(100);
    expect(employerExperienceFit(22.7, true, 8, 20)).toBe(85);
    expect(employerExperienceFit(28, true, 8, 20)).toBe(70);
    expect(employerExperienceFit(40, true, 8, 20)).toBe(55);
    expect(employerExperienceFit(7.1, true, 8, 20)).toBe(80);
    expect(employerExperienceFit(1, true, 8, 20)).toBe(25);
    expect(employerExperienceFit(0, false, 8, 20)).toBe(50);
  });

  it("does not halve the best candidate's experience for being two years over the band", () => {
    const s = seeker({ experienceYears: 22.7 });
    const j = job({ minExp: 8, maxExp: 20 });
    const match = buildApplicantMatch({ pair: pairFor(s, j), seeker: s, job: j, weights: null });
    expect(calculateRelevance(s, j).experience).toBe(50); // the seeker engine, unchanged
    expect(match.matchBreakdown.experience).toBe(85);
  });

  it("counts industry experience alongside the role", () => {
    const s = seeker();
    const j = job();
    const pair = pairFor(s, j);
    const inIndustry = buildApplicantMatch({ pair, seeker: s, job: j, weights: null, industry: { score: 100, matched: ["food_fmcg"], years: 6, source: "roles" } });
    const outside = buildApplicantMatch({ pair, seeker: s, job: j, weights: null, industry: { score: 20, matched: [], years: 0, source: "none" } });
    expect(inIndustry.aiMatchScore).toBeGreaterThan(outside.aiMatchScore);
    expect(inIndustry.matchBreakdown.industry).toBe(100);
    expect(outside.qualifications.find((c) => c.key === "industry")).toMatchObject({ status: "not_met", hard: false });
    expect(inIndustry.qualifications.find((c) => c.key === "industry")).toMatchObject({ status: "met", required: "food_fmcg", actual: "6" });
  });

  it("ranks a candidate near the job a little higher, and says where they are", () => {
    // Below the 100 cap, so every step of nearness shows.
    const s = seeker({ skills: ["React", "Node.js"] });
    const j = job();
    const pair = pairFor(s, j);
    const at = (level: "same_city" | "same_state" | "same_country" | "abroad") =>
      buildApplicantMatch({ pair, seeker: s, job: j, weights: null, locality: { level, jobPlace: "Ernakulam, India", seekerPlace: "Somewhere" } });
    const city = at("same_city").aiMatchScore;
    const state = at("same_state").aiMatchScore;
    const country = at("same_country").aiMatchScore;
    const abroad = at("abroad").aiMatchScore;
    expect(city).toBeGreaterThan(state);
    expect(state).toBeGreaterThan(country);
    expect(country).toBeGreaterThan(abroad);
    expect(city - abroad).toBeLessThanOrEqual(7);
    expect(at("same_state").qualifications.find((c) => c.key === "location")).toMatchObject({
      status: "met",
      hard: false,
      required: "Ernakulam, India",
      actual: "Somewhere",
    });
    expect(at("same_country").qualifications.find((c) => c.key === "location")?.status).toBe("partial");
    expect(at("abroad").qualifications.find((c) => c.key === "location")?.status).toBe("not_met");
  });
});

describe("preferred screening answers", () => {
  const fmcg = {
    id: "fmcg",
    label: "Sales experience in FMCG or food?",
    type: "radio",
    options: ["Yes", "No"],
    preferred: true,
    acceptedAnswers: ["Yes"],
  };

  it("stores a preferred answer privately, without making the question required", () => {
    const { questions, knockouts } = splitScreeningQuestions([fmcg]);
    expect(knockouts).toEqual([{ questionId: "fmcg", acceptedAnswers: ["Yes"], preferred: true }]);
    expect(questions[0]).not.toHaveProperty("acceptedAnswers");
    expect(questions[0]).not.toHaveProperty("preferred");
    expect(questions[0].required).toBeUndefined();
    expect(mergeScreeningKnockouts(questions, knockouts)[0]).toMatchObject({ knockout: false, preferred: true, acceptedAnswers: ["Yes"] });
  });

  it("never excludes anyone, but adds to the score", () => {
    const { questions, knockouts } = splitScreeningQuestions([fmcg]);
    const s = seeker();
    const j = job({ preferredSkills: [] });
    const pair = pairFor(s, j);
    const yes = buildApplicantMatch({ pair, seeker: s, job: j, weights: null, knockouts, questions, answers: [{ questionId: "fmcg", answer: "Yes" }] });
    const no = buildApplicantMatch({ pair, seeker: s, job: j, weights: null, knockouts, questions, answers: [{ questionId: "fmcg", answer: "No" }] });
    expect(no.qualifications.find((c) => c.key === "screening")).toMatchObject({ status: "not_met", hard: false });
    expect(no.requirementsStatus).toBe(yes.requirementsStatus);
    expect(yes.aiMatchScore).toBeGreaterThan(no.aiMatchScore);
  });
});

describe("the CV behind the score", () => {
  const read = (fileName?: string): ApplicantCv => ({ state: "read", fileName, text: "", parsed: null });

  it("says which CV was counted, and never filters on it", () => {
    const s = seeker();
    const j = job();
    const pair = pairFor(s, j);
    const without = buildApplicantMatch({ pair, seeker: s, job: j, weights: null });
    expect(without.qualifications.find((c) => c.key === "cv")).toBeUndefined();

    const cases: Array<[ApplicantCv, string]> = [
      [read("Antony_CV.pdf"), "met"],
      [{ state: "reading" }, "unknown"],
      [{ state: "unreadable", fileName: "scan.pdf" }, "partial"],
      [{ state: "none" }, "unknown"],
    ];
    for (const [cv, status] of cases) {
      const match = buildApplicantMatch({ pair, seeker: s, job: j, weights: null, cv });
      expect(match.qualifications.find((c) => c.key === "cv")).toEqual({
        key: "cv",
        status,
        hard: false,
        actual: cv.state,
        ...(cv.fileName ? { label: cv.fileName } : {}),
      });
      expect(match.requirementsStatus).toBe(without.requirementsStatus);
      expect(match.aiMatchScore).toBe(without.aiMatchScore);
    }
  });

  it("scores skills and jobs the CV shows but the profile left out", () => {
    // A seeker who attached a CV and typed almost nothing.
    const doc = { skills: ["Excel"], experience: [], education: [{ degree: "Bachelor of Commerce" }], preferredCountries: ["united arab emirates"] };
    const cv: ApplicantCv = {
      state: "read",
      text: "Senior full stack developer. React, Node.js, MongoDB, AWS.",
      parsed: normalizeParsedCv({
        skills: ["React", "Node.js", "MongoDB", "AWS"],
        experience: [
          { jobTitle: "Full Stack Developer", company: "Acme", from: "2018-01", to: "present", current: true },
        ],
      }),
    };
    const j = job({ minExp: 5, maxExp: 10 });
    const scoreOf = (seekerDoc: Record<string, unknown>) => {
      const s = seekerProfileFromDoc(seekerDoc);
      return buildApplicantMatch({ pair: pairFor(s, j), seeker: s, job: j, weights: null });
    };
    const profileOnly = scoreOf(doc);
    const withCv = scoreOf(mergeCvIntoSeeker(doc, cv));

    expect(withCv.aiMatchScore).toBeGreaterThan(profileOnly.aiMatchScore);
    expect(withCv.matchedSkills).toEqual(expect.arrayContaining(["React", "Node.js", "MongoDB", "AWS"]));
    // The CV's dated role answers the experience requirement the profile left blank.
    expect(profileOnly.qualifications.find((c) => c.key === "experience")?.status).not.toBe("met");
    expect(withCv.qualifications.find((c) => c.key === "experience")?.status).toBe("met");
  });
});
