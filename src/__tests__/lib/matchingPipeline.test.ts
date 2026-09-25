/**
 * Guards for the recommendation pipeline.
 *
 * Each test here pins a defect that actually shipped. They are cheap and
 * deterministic — no database, no network.
 */

import { checkEligibility } from "@/lib/matching/eligibility";
import { calculateRelevance } from "@/lib/matching/relevance";
import { jobProfileFromDoc, type SeekerProfile, type JobProfile } from "@/lib/matchScore";
import {
  DEFAULT_MIN_RELEVANCE,
  RELEVANCE_WEIGHTS,
  JOB_MATCH_FIELDS,
} from "@/lib/matching/constants";
// Exercised through the real pipeline so the diagnosis is pinned to actual
// behaviour, not to the helper in isolation. This import is only safe because
// recommend.ts takes no runtime dependency on the Mongo-backed vector cache.
import { recommendJobsFor, toCandidateJob } from "@/lib/matching/recommend";

// Jev is stubbed at the client boundary so the blend and the clamp can be
// exercised without a network call or a key.
const mockDecide = jest.fn();
jest.mock("@/lib/ai/jev", () => ({
  ...jest.requireActual("@/lib/ai/jev"),
  hasJev: () => true,
  decide: (...args: unknown[]) => mockDecide(...args),
}));

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: [],
    location: "",
    locations: [],
    experienceYears: 0,
    experienceKnown: false,
    salaryExpectation: 0,
    salaryCurrency: "",
    jobType: "any",
    preferredRoles: [],
    educationLevel: 0,
    city: "",
    cities: [],
    cvText: "",
    roleHistory: [],
    ...overrides,
  };
}

function job(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    skills: [],
    preferredSkills: [],
    location: "india",
    city: "",
    remote: false,
    salaryMin: 0,
    salaryMax: 0,
    salaryPeriod: "monthly",
    salaryCurrency: "",
    remoteScope: undefined,
    remoteCountries: [],
    minExp: 0,
    maxExp: 30,
    title: "software engineer",
    workMode: "",
    requiredEducationLevel: 0,
    ...overrides,
  };
}

describe("eligibility — a criterion only votes when both sides stated it", () => {
  it("does not reject on country when the seeker stated none", () => {
    // 34 of 239 live seekers state no country. Gating them out would silence
    // them permanently.
    expect(checkEligibility(seeker(), job({ location: "india" })).eligible).toBe(true);
  });

  it("does not reject on country when the job states none", () => {
    expect(
      checkEligibility(seeker({ locations: ["india"] }), job({ location: "" })).eligible,
    ).toBe(true);
  });

  it("does not reject on salary when the seeker stated none", () => {
    // Only 21 of 239 live seekers give a salary expectation.
    expect(
      checkEligibility(seeker(), job({ salaryMin: 10000, salaryMax: 20000, salaryCurrency: "INR" }))
        .eligible,
    ).toBe(true);
  });

  it("does not reject on salary when the job states none", () => {
    // 27 of 62 live jobs carry no salary.
    expect(
      checkEligibility(
        seeker({ salaryExpectation: 90000, salaryCurrency: "INR" }),
        job(),
      ).eligible,
    ).toBe(true);
  });

  it("does not reject on salary across different currencies", () => {
    // 5,000 AED is more than 90,000 INR, but the numbers are not comparable.
    expect(
      checkEligibility(
        seeker({ salaryExpectation: 90000, salaryCurrency: "INR" }),
        job({ salaryMin: 5000, salaryMax: 5000, salaryCurrency: "AED" }),
      ).eligible,
    ).toBe(true);
  });

  it("does not reject on experience when the JOB states no minimum", () => {
    // The seeker's silence only stops mattering when the employer is silent
    // too. This test used to assert the opposite — that an unknown experience
    // passed a stated minimum — which is the hole the *_unknown reasons close.
    expect(
      checkEligibility(seeker({ experienceKnown: false }), job({ minExp: 0 })).eligible,
    ).toBe(true);
  });

  it("does not reject on education when the job requires none", () => {
    expect(
      checkEligibility(seeker({ educationLevel: 0 }), job({ requiredEducationLevel: 0 })).eligible,
    ).toBe(true);
  });

  it("does not reject on work mode when the seeker said 'any'", () => {
    expect(
      checkEligibility(seeker({ jobType: "any" }), job({ workMode: "onsite" })).eligible,
    ).toBe(true);
  });

  it("does not reject an over-qualified seeker", () => {
    // Being too senior is a ranking signal, not a disqualification.
    expect(
      checkEligibility(
        seeker({ experienceKnown: true, experienceYears: 15 }),
        job({ minExp: 1, maxExp: 3 }),
      ).eligible,
    ).toBe(true);
  });
});

describe("eligibility — an employer requirement is pass / fail / unknown", () => {
  // 37 of 62 live jobs state a minimum experience. Treating "we never asked"
  // as "meets it" let the score reach 92 for a candidate whose experience is
  // entirely unknown, because relevance scores the missing years at a neutral
  // 0.5 rather than a zero.
  it("rejects as unknown when the job needs years and the seeker never said", () => {
    expect(checkEligibility(seeker({ experienceKnown: false }), job({ minExp: 5 }))).toEqual({
      eligible: false,
      reason: "experience_unknown",
    });
  });

  it("rejects as unknown when the job needs a qualification and the seeker lists none", () => {
    expect(
      checkEligibility(seeker({ educationLevel: 0 }), job({ requiredEducationLevel: 3 })),
    ).toEqual({ eligible: false, reason: "education_unknown" });
  });

  it("separates 'unknown' from 'not enough' so the email can say which", () => {
    const tooJunior = checkEligibility(
      seeker({ experienceKnown: true, experienceYears: 0 }),
      job({ minExp: 5 }),
    );
    expect(tooJunior).toEqual({ eligible: false, reason: "experience" });
  });

  it("lets a declared fresher through a job with no stated minimum", () => {
    // workStatus is what makes 0 years a real answer rather than a blank.
    expect(
      checkEligibility(seeker({ experienceKnown: true, experienceYears: 0 }), job({ minExp: 0 }))
        .eligible,
    ).toBe(true);
  });

  it("caps an unknown-experience seeker's reachable score below any sane bar", () => {
    // The arithmetic behind the gate: a perfect skills and role match with
    // unknown experience still reads 93, which is why a pass was unsafe.
    const best = calculateRelevance(
      seeker({ skills: ["react"], preferredRoles: ["software engineer"], experienceKnown: false }),
      job({ skills: ["react"], title: "software engineer", minExp: 5 }),
    );
    expect(best.overall).toBeGreaterThanOrEqual(DEFAULT_MIN_RELEVANCE);
    expect(checkEligibility(
      seeker({ skills: ["react"], preferredRoles: ["software engineer"], experienceKnown: false }),
      job({ skills: ["react"], title: "software engineer", minExp: 5 }),
    ).eligible).toBe(false);
  });
});

describe("eligibility — rejects when both sides stated and they conflict", () => {
  it("rejects a wrong-country onsite job", () => {
    const result = checkEligibility(seeker({ locations: ["india"] }), job({ location: "oman" }));
    expect(result).toEqual({ eligible: false, reason: "country" });
  });

  it("rejects a remote job in the wrong country when the employer never set a scope", () => {
    // This asserted the opposite until 2026-09-22: `isRemote` skipped the
    // country check outright, so a Qatar-only remote role reached everyone.
    // Unset scope is not a quiet "worldwide" — it falls back to the job's own
    // country, which is the only thing we actually know about those jobs.
    expect(
      checkEligibility(seeker({ locations: ["india"] }), job({ location: "oman", remote: true })),
    ).toEqual({ eligible: false, reason: "country" });
  });

  it("normalises country spellings on both sides", () => {
    // Preferences and job records carry city qualifiers and bare region codes.
    expect(
      checkEligibility(seeker({ locations: ["Oman (Muscat)"] }), job({ location: "oman" }))
        .eligible,
    ).toBe(true);
  });

  it("rejects remote-only seeker against an onsite job", () => {
    expect(checkEligibility(seeker({ jobType: "remote" }), job({ workMode: "onsite" }))).toEqual({
      eligible: false,
      reason: "work_mode",
    });
  });

  it("rejects a seeker more than a year short of the stated minimum", () => {
    expect(
      checkEligibility(seeker({ experienceKnown: true, experienceYears: 1 }), job({ minExp: 5 })),
    ).toEqual({ eligible: false, reason: "experience" });
  });

  it("allows a seeker one year short", () => {
    expect(
      checkEligibility(seeker({ experienceKnown: true, experienceYears: 4 }), job({ minExp: 5 }))
        .eligible,
    ).toBe(true);
  });

  it("rejects a job paying far below a stated expectation in the same currency", () => {
    expect(
      checkEligibility(
        seeker({ salaryExpectation: 100000, salaryCurrency: "INR" }),
        job({ salaryMin: 40000, salaryMax: 40000, salaryCurrency: "INR" }),
      ),
    ).toEqual({ eligible: false, reason: "salary" });
  });
});

describe("relevance — location and salary must not score", () => {
  it("scores two jobs identically when they differ only by country", () => {
    // The gate decides location. If it also scored, a wrong-country job could
    // buy its way back in on other components — which is what the old
    // single-pass scorer allowed.
    const s = seeker({ skills: ["React"], experienceKnown: true, experienceYears: 3 });
    const a = calculateRelevance(s, job({ skills: ["React"], location: "india" }));
    const b = calculateRelevance(s, job({ skills: ["React"], location: "oman" }));
    expect(a.overall).toBe(b.overall);
  });

  it("scores two jobs identically when they differ only by salary", () => {
    const s = seeker({ skills: ["React"], salaryExpectation: 50000, salaryCurrency: "INR" });
    const a = calculateRelevance(s, job({ skills: ["React"], salaryMin: 10000, salaryMax: 10000 }));
    const b = calculateRelevance(s, job({ skills: ["React"], salaryMin: 90000, salaryMax: 90000 }));
    expect(a.overall).toBe(b.overall);
  });

  it("weights sum to 1 so the score is a real percentage", () => {
    const total =
      RELEVANCE_WEIGHTS.skills + RELEVANCE_WEIGHTS.role + RELEVANCE_WEIGHTS.experience;
    expect(total).toBeCloseTo(1, 10);
  });
});

describe("relevance — skills", () => {
  it("gives full credit for every required skill matched", () => {
    const s = seeker({
      skills: ["React", "Node.js"],
      preferredRoles: ["software engineer"],
      experienceKnown: true,
      experienceYears: 3,
    });
    const result = calculateRelevance(s, job({ skills: ["React", "Node.js"], minExp: 2, maxExp: 5 }));
    expect(result.skills).toBe(100);
    expect(result.overall).toBe(100);
    expect(result.matchedSkills).toEqual(["React", "Node.js"]);
  });

  it("caps the denominator so a padded wish-list stays matchable", () => {
    // A 12-skill posting where the candidate has the first six. Scoring
    // against all twelve read as 50%; only the first six are the real ask.
    const listed = ["React", "Node.js", "MongoDB", "Express", "TypeScript", "Git",
      "Kubernetes", "Terraform", "Kafka", "GraphQL", "Redis", "Elasticsearch"];
    const s = seeker({ skills: listed.slice(0, 6) });
    expect(calculateRelevance(s, job({ skills: listed })).skills).toBe(100);
  });

  it("reports a job that lists no skills as unknown, not as a match", () => {
    // 22 of 62 live jobs are in this state. They must not score highly.
    const s = seeker({ skills: ["React"] });
    const result = calculateRelevance(s, job({ skills: [] }));
    expect(result.skillsUnknown).toBe(true);
    expect(result.skills).toBe(15);
  });

  it("cannot reach the default threshold on a job with no stated skills", () => {
    // Even with a perfect role and experience match.
    const s = seeker({
      skills: ["React"],
      preferredRoles: ["software engineer"],
      experienceKnown: true,
      experienceYears: 3,
    });
    const result = calculateRelevance(s, job({ skills: [], minExp: 2, maxExp: 5 }));
    expect(result.overall).toBeLessThan(DEFAULT_MIN_RELEVANCE);
  });

  it("credits a skill found only in the CV text", () => {
    const withCv = seeker({ skills: [], cvText: "Five years building react applications" });
    const without = seeker({ skills: [] });
    expect(calculateRelevance(withCv, job({ skills: ["React"] })).skills).toBeGreaterThan(
      calculateRelevance(without, job({ skills: ["React"] })).skills,
    );
  });

  it.each([
    ["Java", "Senior JavaScript developer"],
    ["SAP", "Ran WhatsApp marketing campaigns"],
    ["Excel", "Excellent communication skills"],
    ["Rust", "Built trust with enterprise clients"],
  ])("does not read %s out of a longer word (%s)", (skill, cvText) => {
    const result = calculateRelevance(seeker({ skills: [], cvText }), job({ skills: [skill] }));
    expect(result.matchedSkills).toEqual([]);
    expect(result.skills).toBe(0);
  });

  it.each([
    ["React", "Built dashboards in ReactJS"],
    ["Node.js", "APIs on Node.js and Express"],
    ["ASP.NET", "Maintained ASP.NET MVC apps"],
    ["C++", "Low-latency C++ services"],
    ["Machine Learning", "Applied machine learning to churn"],
  ])("still finds %s written as a whole word in the CV (%s)", (skill, cvText) => {
    const result = calculateRelevance(seeker({ skills: [], cvText }), job({ skills: [skill] }));
    expect(result.matchedSkills).toEqual([skill]);
  });
});

describe("jobProfileFromDoc — extracted skills are a fallback, never an override", () => {
  it("prefers the employer's own list", () => {
    const profile = jobProfileFromDoc({
      requirements: { skills: ["React"], aiSkills: ["Angular", "Vue"] },
    });
    expect(profile.skills).toEqual(["React"]);
  });

  it("falls back to extracted skills when the employer typed none", () => {
    const profile = jobProfileFromDoc({ requirements: { skills: [], aiSkills: ["Angular"] } });
    expect(profile.skills).toEqual(["Angular"]);
  });
});

describe("JOB_MATCH_FIELDS covers everything the scorer reads", () => {
  // The weekly digest projected `employerName skills salaryRange
  // experienceLevel` — four paths that do not exist on the Job schema — so it
  // ranked on title and country alone while printing a match percentage.
  // A projection that omits a field the reader needs fails silently, which is
  // why this is pinned rather than reviewed.
  const REQUIRED = [
    "title",
    "requirements",
    "salary",
    "location",
    "workMode",
    "employerId",
    "createdAt",
  ];

  it.each(REQUIRED)("includes %s", (field) => {
    expect(JOB_MATCH_FIELDS.split(/\s+/)).toContain(field);
  });

  it("names only top-level Job paths", () => {
    // A dotted path in a projection silently returns nothing when the parent
    // is absent; the scorer reads whole subdocuments instead.
    for (const field of JOB_MATCH_FIELDS.split(/\s+/)) {
      expect(field).not.toContain(".");
    }
  });
});

describe("limiting factor — why a seeker was sent nothing", () => {
  const candidate = (over: Record<string, unknown> = {}) =>
    toCandidateJob({
      _id: "j1",
      title: "React Developer",
      location: { country: "India", isRemote: false },
      requirements: { skills: ["React", "Node.js"], experienceMin: 0, experienceMax: 10 },
      employerId: { companyName: "Acme" },
      ...over,
    });

  it("blames the empty profile, not the job board, when no skills are listed", async () => {
    // This was the live bug: 5 skill-less seekers cleared the >=2-signal gate,
    // scored a ceiling of 40%, and were told "most openings are outside your
    // countries" — true of the jobs that were dropped, useless as advice.
    const result = await recommendJobsFor(
      seeker({ locations: ["india"], experienceKnown: true, experienceYears: 3 }),
      [candidate(), candidate({ _id: "j2", location: { country: "Oman" } })],
      { threshold: 80, useAi: false },
    );
    expect(result.jobs).toHaveLength(0);
    expect(result.limitingFactor).toBe("no_skills");
  });

  it("names the gate when a gate really is the cause", async () => {
    const result = await recommendJobsFor(
      seeker({ skills: ["React", "Node.js"], locations: ["oman"] }),
      [candidate(), candidate({ _id: "j2" }), candidate({ _id: "j3" })],
      { threshold: 80, useAi: false },
    );
    expect(result.jobs).toHaveLength(0);
    expect(result.limitingFactor).toBe("country");
  });

  it("says 'score' when plenty was eligible and simply not good enough", async () => {
    const result = await recommendJobsFor(
      seeker({
        skills: ["Photoshop"],
        locations: ["india"],
        preferredRoles: ["graphic designer"],
        experienceKnown: true,
        experienceYears: 3,
      }),
      [candidate(), candidate({ _id: "j2" })],
      { threshold: 80, useAi: false },
    );
    expect(result.jobs).toHaveLength(0);
    expect(result.limitingFactor).toBe("score");
  });

  it("reports no limiting factor when something did clear the bar", async () => {
    const result = await recommendJobsFor(
      seeker({
        skills: ["React", "Node.js"],
        locations: ["india"],
        preferredRoles: ["react developer"],
        experienceKnown: true,
        experienceYears: 3,
      }),
      [candidate()],
      { threshold: 80, useAi: false },
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.limitingFactor).toBeUndefined();
  });
});

describe("AI re-rank — Jev advises, it does not decide", () => {
  beforeEach(() => mockDecide.mockReset());

  const strongCandidate = () =>
    toCandidateJob({
      _id: "j1",
      title: "React Developer",
      location: { country: "India", isRemote: false },
      requirements: { skills: ["React", "Node.js"], experienceMin: 0, experienceMax: 10 },
      employerId: { companyName: "Acme" },
    });

  const applicant = () =>
    seeker({
      skills: ["React"],
      locations: ["india"],
      preferredRoles: ["react developer"],
      experienceKnown: true,
      experienceYears: 3,
    });

  it("never moves a score by more than the clamp, however confident", async () => {
    // Blending at 35% alone let a confident "yes" add up to 35 points, which
    // turns a 70 into a shipped 80 on the model's say-so.
    mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 1 } } });
    const deterministic = await recommendJobsFor(applicant(), [strongCandidate()], {
      threshold: 0,
      useAi: false,
    });
    const withAi = await recommendJobsFor(applicant(), [strongCandidate()], {
      threshold: 0,
      useAi: true,
    });
    expect(withAi.aiUsed).toBe(true);
    expect(withAi.jobs[0].score - deterministic.jobs[0].score).toBeLessThanOrEqual(10);
  });

  it("never drops a score by more than the clamp either", async () => {
    // The other half of the same risk: an unqualified "no" used to take 33
    // points off a job the arithmetic was sure about.
    mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0 } } });
    const deterministic = await recommendJobsFor(applicant(), [strongCandidate()], {
      threshold: 0,
      useAi: false,
    });
    const withAi = await recommendJobsFor(applicant(), [strongCandidate()], {
      threshold: 0,
      useAi: true,
    });
    expect(deterministic.jobs[0].score - withAi.jobs[0].score).toBeLessThanOrEqual(10);
  });

  it("cannot rescue a job the eligibility gate rejected", async () => {
    // Jev is only ever shown survivors, so a wrong-country job is unreachable
    // no matter what it answers.
    mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 1 } } });
    const result = await recommendJobsFor(
      seeker({ skills: ["React"], locations: ["oman"], preferredRoles: ["react developer"] }),
      [strongCandidate()],
      { threshold: 0, useAi: true },
    );
    expect(result.jobs).toHaveLength(0);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it("degrades to the deterministic score when Jev returns nothing", async () => {
    mockDecide.mockResolvedValue(null);
    const result = await recommendJobsFor(applicant(), [strongCandidate()], {
      threshold: 0,
      useAi: true,
    });
    expect(result.aiUsed).toBe(false);
    expect(result.jobs[0].score).toBe(result.jobs[0].breakdown.overall);
  });
});

describe("relevance — the arithmetic behind the published ceilings", () => {
  // Both figures appear in the implementation report; pin them so the report
  // and the code cannot drift apart.
  it("caps a skill-less seeker at 40 against a job that does list skills", () => {
    const r = calculateRelevance(
      seeker({ preferredRoles: ["react developer"], experienceKnown: true, experienceYears: 3 }),
      job({ skills: ["React"], title: "react developer", minExp: 0, maxExp: 10 }),
    );
    // 0 x 0.60 + 1.00 x 0.25 + 1.00 x 0.15 = 0.40
    expect(r.skills).toBe(0);
    expect(r.overall).toBe(40);
  });

  it("caps it at 49 against a job that lists none either", () => {
    const r = calculateRelevance(
      seeker({ preferredRoles: ["react developer"], experienceKnown: true, experienceYears: 3 }),
      job({ skills: [], title: "react developer", minExp: 0, maxExp: 10 }),
    );
    // The no-evidence floor, not a re-weighting: 0.15 x 0.60 + 0.25 + 0.15 = 0.49
    expect(r.skillsUnknown).toBe(true);
    expect(r.overall).toBe(49);
  });

  it("keeps the weights fixed — nothing is re-normalised when skills are absent", () => {
    expect(
      RELEVANCE_WEIGHTS.skills + RELEVANCE_WEIGHTS.role + RELEVANCE_WEIGHTS.experience,
    ).toBeCloseTo(1);
  });
});

describe("eligibility — remote is a hiring scope, not a blank cheque", () => {
  // `isRemote` says how the work is done, not who may be hired to do it. A
  // remote job can still be limited by work authorisation, payroll entity or
  // timezone, so the employer states the scope and only "worldwide" lifts the
  // country check.
  const indian = () => seeker({ locations: ["india"] });

  it("lets a worldwide remote job reach any country", () => {
    expect(
      checkEligibility(
        indian(),
        job({ location: "oman", remote: true, remoteScope: "worldwide" }),
      ).eligible,
    ).toBe(true);
  });

  it("accepts a restricted remote job when the seeker is in an allowed country", () => {
    expect(
      checkEligibility(
        indian(),
        job({
          location: "oman",
          remote: true,
          remoteScope: "countries",
          remoteCountries: ["oman", "india"],
        }),
      ).eligible,
    ).toBe(true);
  });

  it("rejects a restricted remote job when the seeker is outside the list", () => {
    expect(
      checkEligibility(
        indian(),
        job({
          location: "oman",
          remote: true,
          remoteScope: "countries",
          remoteCountries: ["oman", "qatar"],
        }),
      ),
    ).toEqual({ eligible: false, reason: "country" });
  });

  it("normalises the allowed-country list the same way as everything else", () => {
    // Job records and preferences carry city qualifiers and bare region codes.
    expect(
      checkEligibility(
        seeker({ locations: ["Oman (Muscat)"] }),
        job({
          location: "india",
          remote: true,
          remoteScope: "countries",
          remoteCountries: ["OM"],
        }),
      ).eligible,
    ).toBe(true);
  });

  it("still ignores country entirely when the seeker named none", () => {
    // Which country to work in is the seeker's preference, and silence is not
    // a preference — that half of the rule is unchanged.
    expect(
      checkEligibility(
        seeker(),
        job({ location: "oman", remote: true, remoteScope: "countries", remoteCountries: ["oman"] }),
      ).eligible,
    ).toBe(true);
  });

  it("leaves non-remote jobs on exactly the rule they had before", () => {
    expect(checkEligibility(indian(), job({ location: "india" })).eligible).toBe(true);
    expect(checkEligibility(indian(), job({ location: "oman" })).reason).toBe("country");
    // A job with no country stated still cannot reject anyone.
    expect(checkEligibility(indian(), job({ location: "" })).eligible).toBe(true);
  });

  it("does not let an empty allowed-country list silence a job", () => {
    // A half-saved "countries" scope with nothing in it is bad data, not an
    // instruction to hide the job from everyone. The API refuses to store it;
    // this is the belt to that braces.
    expect(
      checkEligibility(
        indian(),
        job({ location: "oman", remote: true, remoteScope: "countries", remoteCountries: [] }),
      ).eligible,
    ).toBe(true);
  });
});
