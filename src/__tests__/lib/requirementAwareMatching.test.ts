/**
 * @jest-environment node
 *
 * Requirement-aware matching (plan 2026-11-12): each job's own education,
 * experience "in what", licences and languages, read once and judged once,
 * so the seeker score, the employer score and the requirement report agree.
 *
 * Pins the decisions the owner took:
 *   D6/D15  education and experience never hide a job;
 *   D7      skills 40 · role 25 · experience 15 · education 20, licences and
 *           languages join only when the job states them;
 *   D8      a job with no skills leaves skills out;
 *   D13     a licence nothing mentions scores 25, "needs verification";
 *   D14     stored languages count only once the employer confirmed them;
 *   D16     the email holds back a job whose must-have is missing or unverified;
 *   D20     the email and auto-apply hold back a job that asks for nothing
 *           beyond its title; education scores only when the job asks for it;
 * and the cases the owner asked about by name: a master's for a bachelor's
 * job, and 4 years against "5 years in MERN stack" reading as Partly.
 */
import { educationLevel, seekerEntryLevel } from "@/lib/matching/educationLevel";
import { readJobRequirements } from "@/lib/matching/jobRequirements";
import { seekerEvidenceFromDoc } from "@/lib/matching/seekerEvidence";
import { evaluateRequirements, yearsMark } from "@/lib/matching/requirementParts";
import { buildRequirementReport } from "@/lib/matching/requirementReport";
import { checkEligibility } from "@/lib/matching/eligibility";
import { calculateRelevance, hasIdentifiableRequirement } from "@/lib/matching/relevance";
import { recommendJobsFor, toCandidateJob } from "@/lib/matching/recommend";
import IntlMessageFormat from "intl-messageformat";
import en from "../../../messages/en.json";
import ar from "../../../messages/ar.json";
import { jobProfileFromDoc, seekerProfileFromDoc } from "@/lib/matchScore";
import { stampLanguagesConfirmed } from "@/lib/jobs/requirementLanguages";
import { standardWeightsFor, DEFAULT_WEIGHTS } from "@/lib/ai/matchingWeights";

const NOW = new Date("2026-11-12T00:00:00Z").getTime();
const yearsAgo = (n: number) => new Date(NOW - n * 365.25 * 24 * 3600 * 1000).toISOString();

function job(doc: Parameters<typeof jobProfileFromDoc>[0]) {
  return jobProfileFromDoc({ title: "Software Engineer", location: { country: "India" }, ...doc });
}

function seeker(doc: Parameters<typeof seekerProfileFromDoc>[0]) {
  return seekerProfileFromDoc({ preferredCountries: ["India"], ...doc });
}

describe("educationLevel — whole words, the degrees seekers here write", () => {
  it.each([
    ["SSLC", 1],
    ["Plus Two", 1],
    ["Higher Secondary (12th)", 1],
    ["Diploma in Mechanical", 2],
    ["B.Tech", 3],
    ["Bachelor's degree", 3],
    ["MBA", 4],
    ["M.Sc Physics", 4],
    ["PhD", 5],
    ["Utilities manager", 0],
    ["CA Intermediate", 0],
  ])("%s → %i", (text, level) => {
    expect(educationLevel(text, true)).toBe(level);
  });

  it("reads the old onboarding choice 'Graduation/Diploma' as the lower level unless the course says more", () => {
    expect(seekerEntryLevel({ degree: "Graduation/Diploma" })).toBe(2);
    expect(seekerEntryLevel({ degree: "Graduation/Diploma", course: "B.Tech/B.E." })).toBe(3);
  });
});

describe("readJobRequirements", () => {
  it("the form's level wins, and 0 is an explicit 'No minimum'", () => {
    const none = readJobRequirements({ requirements: { educationLevel: 0, education: "Bachelor's degree" } });
    expect(none.education.level).toBe(0);
    expect(none.education.source).toBe("form");
    const form = readJobRequirements({ requirements: { educationLevel: 3, educationField: "Computer Science or related" } });
    expect(form.education).toMatchObject({ level: 3, source: "form", relatedAllowed: true, importance: "must" });
  });

  it("reads old jobs from the Education box, then the qualification lines", () => {
    const box = readJobRequirements({ requirements: { education: "Bachelor of Science in Nursing" } });
    expect(box.education).toMatchObject({ level: 3, source: "education_box" });
    expect(box.education.families).toContain("nursing");
    const line = readJobRequirements({ qualifications: ["Master's degree in Finance preferred"] });
    expect(line.education).toMatchObject({ level: 4, importance: "nice", source: "qualification_line" });
  });

  it("experience 'in what': the form, else a years line, else the title", () => {
    expect(readJobRequirements({ requirements: { experienceMin: 5, experienceIn: "MERN stack" } }).experience).toMatchObject({
      subject: "MERN stack",
      subjectSource: "form",
    });
    expect(
      readJobRequirements({ title: "Developer", qualifications: ["5+ years of experience in MERN stack"] }).experience,
    ).toMatchObject({ subject: "MERN stack", subjectSource: "qualification_line" });
    expect(readJobRequirements({ title: "Accountant" }).experience).toMatchObject({ subject: "Accountant", subjectSource: "title" });
  });

  it("D14: stored languages count only once confirmed", () => {
    const unconfirmed = readJobRequirements({ requirements: { languages: ["English", "Malayalam"] } });
    expect(unconfirmed.languages.names).toEqual([]);
    expect(unconfirmed.languages.unconfirmed).toEqual(["english", "malayalam"]);
    const confirmed = readJobRequirements({ requirements: { languages: ["English"], languagesConfirmedAt: new Date() } });
    expect(confirmed.languages.names).toEqual(["english"]);
  });

  it("licences from the form or the qualification lines; visa lines apart", () => {
    const req = readJobRequirements({ qualifications: ["Valid UAE driving licence", "Transferable Iqama"] });
    expect(req.credentials).toHaveLength(1);
    expect(req.credentials[0]).toMatchObject({ driving: true, importance: "must" });
    expect(req.visaLines).toEqual(["Transferable Iqama"]);
  });
});

describe("evaluateRequirements", () => {
  it("a master's counts for a bachelor's job, as an equivalent", () => {
    const ev = evaluateRequirements(
      seeker({ education: [{ degree: "M.Sc", field: "Computer Science" }] }),
      job({ requirements: { educationLevel: 3, educationField: "Computer Science" } }),
    );
    expect(ev.education).toMatchObject({ status: "met", equivalent: true, mark: 100 });
  });

  it("one level short is Partly; two is Does not have; nothing readable needs checking", () => {
    const asked = job({ requirements: { educationLevel: 3 } });
    expect(evaluateRequirements(seeker({ education: [{ degree: "Diploma" }] }), asked).education).toMatchObject({ status: "partial", mark: 50 });
    expect(evaluateRequirements(seeker({ education: [{ degree: "SSLC" }] }), asked).education).toMatchObject({ status: "not_met", mark: 0 });
    expect(evaluateRequirements(seeker({}), asked).education).toMatchObject({ status: "unknown", mark: 25 });
  });

  it("an essential field: a different field is a miss", () => {
    const ev = evaluateRequirements(
      seeker({ education: [{ degree: "B.Com", field: "Commerce" }] }),
      job({ requirements: { educationLevel: 3, educationField: "Nursing", educationFieldEssential: true } }),
    );
    expect(ev.education).toMatchObject({ status: "not_met", relation: "different", mark: 0 });
  });

  it("a named subject is a field: BSc Psychology is a different field from Computer Science", () => {
    // Live check 2026-11-12: psychology sat in the generic "arts" family, so the
    // stated field read as "not stated" and the candidate showed as Has.
    const ev = evaluateRequirements(
      seeker({ education: [{ degree: "Bsc", field: "Psychology" }] }),
      job({ requirements: { educationLevel: 3, educationField: "Computer Science, Engineering or related" } }),
    );
    expect(ev.education).toMatchObject({ status: "partial", relation: "different" });
  });

  it("an incomplete degree is not held", () => {
    const ev = evaluateRequirements(
      seeker({ education: [{ degree: "BSc Computer Science (Incomplete)", field: "Computer Science" }] }),
      job({ requirements: { educationLevel: 3, educationField: "Computer Science" } }),
    );
    expect(ev.education?.status).not.toBe("met");
  });

  it("a bare 'BSc' still reads as field not stated", () => {
    const ev = evaluateRequirements(
      seeker({ education: [{ degree: "BSc" }] }),
      job({ requirements: { educationLevel: 3, educationField: "Computer Science" } }),
    );
    expect(ev.education?.relation).toBe("not_stated");
  });

  it("4 years against '5 years in MERN stack' reads as Partly", () => {
    const ev = evaluateRequirements(
      seeker({
        experience: [{ jobTitle: "MERN Stack Developer", description: "React, Node, MongoDB", startDate: yearsAgo(4), isCurrent: true }],
      }),
      job({ requirements: { experienceMin: 5, experienceMax: 10, experienceIn: "MERN stack" } }),
    );
    expect(ev.experience.status).toBe("partial");
    expect(ev.experience.relevantYears).toBeCloseTo(4, 0);
  });

  it("years in another field do not count when the employer named the subject", () => {
    const ev = evaluateRequirements(
      seeker({ experience: [{ jobTitle: "Sales Executive", startDate: yearsAgo(8), isCurrent: true }] }),
      job({ requirements: { experienceMin: 5, experienceMax: 10, experienceIn: "MERN stack" } }),
    );
    expect(ev.experience.status).toBe("not_met");
    // Never below half of what the career length earns.
    expect(ev.experience.mark).toBe(50);
  });

  it("D13: a licence nothing mentions needs verification (25), not a failure", () => {
    const ev = evaluateRequirements(
      seeker({ skills: ["Driving"], cv: { rawText: "Experienced driver" } }),
      job({ requirements: { credentials: [{ name: "Valid DHA licence", importance: "must" }] } }),
    );
    expect(ev.credentials[0]).toMatchObject({ status: "unknown", mark: 25 });
    expect(ev.mustHaveStatus).toBe("unverified");
  });

  it("overlapping roles count once", () => {
    const ev = evaluateRequirements(
      seeker({
        experience: [
          { jobTitle: "Accountant", startDate: yearsAgo(4), isCurrent: true },
          { jobTitle: "Accountant (part time)", startDate: yearsAgo(3), endDate: yearsAgo(1) },
        ],
      }),
      job({ title: "Accountant", requirements: { experienceMin: 3, experienceMax: 8, experienceIn: "accounting" } }),
    );
    expect(ev.experience.relevantYears).toBeCloseTo(4, 0);
  });

  it("the years curve: short costs more than over", () => {
    expect(yearsMark(5, 5, 8)).toBe(100);
    expect(yearsMark(4, 5, 8)).toBe(80);
    expect(yearsMark(11, 5, 8)).toBe(85);
  });
});

describe("D6/D15 — education and experience never hide a job", () => {
  it("a seeker two levels short and years short is still eligible", () => {
    const s = seeker({ education: [{ degree: "SSLC" }], experience: [{ jobTitle: "Helper", startDate: yearsAgo(1), isCurrent: true }] });
    const j = job({ requirements: { educationLevel: 4, experienceMin: 8, experienceMax: 12 } });
    expect(checkEligibility(s, j).eligible).toBe(true);
  });
});

describe("D7/D8 — the seeker score", () => {
  it("core parts are skills 40 · role 25 · experience 15 · education 20", () => {
    const r = calculateRelevance(
      seeker({ skills: ["React"], education: [{ degree: "B.Tech" }] }),
      job({ requirements: { skills: ["React"], educationLevel: 3 } }),
    );
    expect(r.shares).toEqual({ role: 25, experience: 15, education: 20, skills: 40 });
  });

  it("a job with no skills leaves skills out of the score", () => {
    const r = calculateRelevance(seeker({ skills: ["React"] }), job({ requirements: { educationLevel: 0 } }));
    expect(r.skillsUnknown).toBe(true);
    expect(r.shares.skills).toBeUndefined();
  });

  it("licences and languages join when the job states them", () => {
    const r = calculateRelevance(
      seeker({ skills: ["React"] }),
      job({
        requirements: {
          skills: ["React"],
          credentials: [{ name: "PMP", importance: "nice" }],
          languages: ["Arabic"],
          languagesConfirmedAt: new Date(),
        },
      }),
    );
    expect(r.shares.credentials).toBeDefined();
    expect(r.shares.languages).toBeDefined();
    expect(Object.values(r.shares).reduce((a, b) => a + (b ?? 0), 0)).toBe(100);
  });
});

describe("no free points for what the job does not ask (owner, 2026-11-12)", () => {
  const total = (shares: Record<string, number | undefined>) => Object.values(shares).reduce<number>((a, b) => a + (b ?? 0), 0);
  const s = () => seeker({ skills: ["React"], preferredRoles: ["software engineer"], totalExperienceYears: 3 });

  it("a job without skills leaves skills out", () => {
    const r = calculateRelevance(s(), job({ requirements: { educationLevel: 3 } }));
    expect(r.shares.skills).toBeUndefined();
    expect(r.shares.education).toBeDefined();
  });

  it("a job without an education requirement leaves education out", () => {
    const r = calculateRelevance(s(), job({ requirements: { skills: ["React"], educationLevel: 0 } }));
    expect(r.education).toBeNull();
    expect(r.shares.education).toBeUndefined();
    expect(r.shares.skills).toBeDefined();
  });

  it("a job with neither scores role and experience only", () => {
    const r = calculateRelevance(s(), job({ requirements: {} }));
    expect(Object.keys(r.shares).sort()).toEqual(["experience", "role"]);
  });

  it("a job with every requirement scores every part", () => {
    const r = calculateRelevance(
      s(),
      job({
        requirements: {
          skills: ["React"],
          educationLevel: 3,
          experienceMin: 2,
          credentials: [{ name: "PMP", importance: "nice" }],
          languages: ["Arabic"],
          languagesConfirmedAt: new Date(),
        },
      }),
    );
    expect(Object.keys(r.shares).sort()).toEqual(["credentials", "education", "experience", "languages", "role", "skills"]);
  });

  it("a degree asked and no education on the profile is scored at 25, needs verification, not left out", () => {
    const r = calculateRelevance(s(), job({ requirements: { skills: ["React"], educationLevel: 3 } }));
    expect(r.education).toBe(25);
    expect(r.evaluation.education?.status).toBe("unknown");
    expect(r.shares.education).toBeDefined();
  });

  it("the shares of the parts in play always add to 100", () => {
    const jobs = [
      job({ requirements: {} }),
      job({ requirements: { skills: ["React"] } }),
      job({ requirements: { educationLevel: 3 } }),
      job({ requirements: { skills: ["React"], educationLevel: 3, credentials: [{ name: "PMP", importance: "must" }] } }),
      job({ requirements: { skills: ["React"], languages: ["Arabic"], languagesConfirmedAt: new Date() } }),
    ];
    for (const j of jobs) expect(total(calculateRelevance(s(), j).shares)).toBe(100);
  });
});

describe("requirement report", () => {
  it("one row per requirement with has / partly / missing / verify", () => {
    const s = seeker({
      skills: ["React", "Node.js"],
      education: [{ degree: "Diploma" }],
      experience: [{ jobTitle: "MERN Developer", startDate: yearsAgo(4), isCurrent: true }],
    });
    const j = job({
      requirements: {
        skills: ["React", "GraphQL"],
        educationLevel: 3,
        experienceMin: 5,
        experienceMax: 8,
        experienceIn: "MERN stack",
        credentials: [{ name: "AWS certification", importance: "nice" }],
      },
    });
    const relevance = calculateRelevance(s, j);
    const report = buildRequirementReport(relevance.evaluation, relevance, j.requirements);
    const byKind = (kind: string) => report.items.filter((i) => i.kind === kind);
    expect(byKind("education")[0]).toMatchObject({ verdict: "partial", mustHave: true });
    expect(byKind("experience")[0]).toMatchObject({ verdict: "partial", required: "5–8 years in MERN stack" });
    expect(byKind("skill").map((i) => [i.required, i.verdict])).toEqual([
      ["React", "has"],
      ["GraphQL", "missing"],
    ]);
    expect(byKind("credential")[0]).toMatchObject({ verdict: "verify", mustHave: false });
    expect(report.counts.missing).toBe(1);
  });
});

describe("career length and relevant years (live check 2026-11-12)", () => {
  // seekerProfileFromDoc reads the real clock, so these dates are relative to it.
  const ago = (n: number) => new Date(Date.now() - n * 365.25 * 24 * 3600 * 1000).toISOString();

  it("a role with no end date ends where the next role starts", () => {
    const s = seeker({
      experience: [
        { jobTitle: "Full Stack Intern", startDate: ago(2.4) },
        { jobTitle: "MERN Stack Developer", startDate: ago(1.9), isCurrent: true },
      ],
    });
    // Counting the internship to today read as 4.3 years.
    expect(s.experienceYears).toBeCloseTo(2.4, 1);
  });

  // Owner, 2026-11-13: an internship with no end date was counted up to the
  // next job (six months nobody stated) and that alone met "2–5 years".
  const internThenJob = (internEnd?: string) =>
    seeker({
      experience: [
        { jobTitle: "Full Stack Intern", startDate: ago(2.4), ...(internEnd ? { endDate: internEnd } : {}) },
        { jobTitle: "MERN Stack Developer", startDate: ago(1.9), isCurrent: true },
      ],
    });
  const mernJob = (experienceMin: number) =>
    job({ title: "MERN Stack Developer", requirements: { experienceMin, experienceMax: 5 } });

  it("an estimated end date cannot meet a years requirement by itself", () => {
    const j = mernJob(2);
    const relevance = calculateRelevance(internThenJob(), j);
    const ex = relevance.evaluation.experience;
    expect(ex.status).toBe("unknown");
    expect(ex.needsEndDate).toEqual(["Full Stack Intern"]);
    expect(ex.confirmedYears).toBeCloseTo(1.9, 1);
    // Marked on the years that are certain: within a year of the minimum.
    expect(ex.mark).toBe(80);
    expect(relevance.evaluation.mustHaveStatus).toBe("unverified");

    const row = buildRequirementReport(relevance.evaluation, relevance, j.requirements).items.find((i) => i.kind === "experience");
    expect(row).toMatchObject({ verdict: "verify", detail: { needsEndDate: ["Full Stack Intern"] } });
    expect(row?.detail?.confirmedYears).toBeCloseTo(1.9, 1);
  });

  it("with the end date given, the same career meets it", () => {
    const ex = calculateRelevance(internThenJob(ago(1.9)), mernJob(2)).evaluation.experience;
    expect(ex.status).toBe("met");
    expect(ex.needsEndDate).toBeUndefined();
  });

  it("an estimate changes nothing when the certain years already meet the requirement", () => {
    const ex = calculateRelevance(internThenJob(), mernJob(1)).evaluation.experience;
    expect(ex.status).toBe("met");
    expect(ex.needsEndDate).toBeUndefined();
    expect(ex.mark).toBe(100);
  });

  it("a lone role with no end date and not current is undated, so a stated total counts", () => {
    const s = seeker({ totalExperienceYears: 1, experience: [{ jobTitle: "Sales Executive", startDate: ago(6) }] });
    expect(s.experienceYears).toBe(1);
    expect(s.evidence?.roles[0].dated).toBe(false);
  });

  it("overlapping roles count once", () => {
    const s = seeker({
      experience: [
        { jobTitle: "Developer", company: "A", startDate: ago(3), isCurrent: true },
        { jobTitle: "Freelance Developer", company: "B", startDate: ago(2), isCurrent: true },
      ],
    });
    expect(s.experienceYears).toBeCloseTo(3, 1);
  });

  it("with only the title to go on, one shared title word does not make a role relevant", () => {
    const s = seeker({
      experience: [
        { jobTitle: "Full Stack Intern", description: "Set up the CI pipeline for an e-commerce site", startDate: ago(2.4), endDate: ago(1.9) },
        { jobTitle: "MERN Stack Developer", startDate: ago(1.9), isCurrent: true },
      ],
    });
    const j = job({ title: "E2E Pipeline QA Engineer 1794404268367", requirements: { experienceMin: 1, experienceMax: 10 } });
    const relevance = calculateRelevance(s, j);
    const ex = relevance.evaluation.experience;
    expect(ex.asked.subjectSource).toBe("title");
    expect(ex.relevantRoles).toHaveLength(0);
    expect(ex.status).toBe("met");
    const report = buildRequirementReport(relevance.evaluation, relevance, j.requirements);
    expect(report.items.find((i) => i.kind === "experience")?.required).toBe("1–10 years");
  });

  it("a role whose title shares the job's role still counts with only the title to go on", () => {
    const s = seeker({ experience: [{ jobTitle: "QA Engineer", startDate: ago(3), isCurrent: true }] });
    const j = job({ title: "Senior QA Engineer", requirements: { experienceMin: 2, experienceMax: 6 } });
    expect(calculateRelevance(s, j).evaluation.experience.relevantRoles).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("languages are stamped confirmed only when a save sends them", () => {
    const at = new Date("2026-11-12T00:00:00Z");
    expect(stampLanguagesConfirmed({ skills: [] }, at)).toEqual({ skills: [] });
    expect(stampLanguagesConfirmed({ languages: ["English"] }, at)).toEqual({ languages: ["English"], languagesConfirmedAt: at });
    expect(stampLanguagesConfirmed({ languages: [] }, at)).toEqual({ languages: [], languagesConfirmedAt: null });
  });

  it("D17: the standard weights follow the hire type", () => {
    expect(standardWeightsFor(null)).toBe(DEFAULT_WEIGHTS);
    expect(DEFAULT_WEIGHTS).toEqual({ skills: 35, experience: 40, education: 15, industryExperience: 5, preferredQualifications: 5 });
    expect(standardWeightsFor("qualification").education).toBe(35);
  });

  it("seeker evidence: a degree still being studied is not held", () => {
    const evidence = seekerEvidenceFromDoc(
      { education: [{ degree: "B.Tech", graduationDate: new Date(NOW + 365 * 24 * 3600 * 1000).toISOString() }, { degree: "Plus Two" }] },
      NOW,
    );
    expect(evidence.level).toBe(1);
  });
});

describe("D20 — mail and auto-apply need a requirement beyond the title (owner, 2026-11-12)", () => {
  const doc = (id: string, title: string, requirements: Record<string, unknown> = {}, qualifications: string[] = []) => ({
    _id: id,
    title,
    status: "active",
    location: { country: "India" },
    requirements,
    qualifications,
  });
  const cases: Array<[string, ReturnType<typeof doc>, boolean]> = [
    ["MERN developer with 6 skills", doc("mern", "MERN Developer", { skills: ["React", "Node.js", "MongoDB", "Express", "JavaScript", "REST APIs"] }), true],
    ["Nurse: nursing degree + DHA licence", doc("nurse", "Staff Nurse", { educationLevel: 3, educationField: "Nursing", credentials: [{ name: "DHA licence", importance: "must" }] }), true],
    ["Accountant: accounting degree + 5 years", doc("acct", "Accountant", { educationLevel: 3, educationField: "Accounting", experienceMin: 5, experienceMax: 10 }), true],
    ["Driver: valid driving licence", doc("driver", "Driver", { credentials: [{ name: "Valid driving licence", importance: "must" }] }), true],
    ["Developer: title only", doc("dev", "Developer"), false],
    ["Manager: title only", doc("mgr", "Manager"), false],
  ];

  it.each(cases)("%s", (_name, jobDoc, expected) => {
    expect(hasIdentifiableRequirement(toCandidateJob(jobDoc).profile)).toBe(expected);
  });

  it("'No minimum' education and unconfirmed stored languages do not count", () => {
    const j = toCandidateJob(doc("x", "Sales Executive", { educationLevel: 0, languages: ["Arabic"] }));
    expect(hasIdentifiableRequirement(j.profile)).toBe(false);
  });

  it("holds title-only jobs back from the email list, counted apart from must-haves", async () => {
    const s = seeker({ skills: ["React"], preferredRoles: ["developer", "manager"], totalExperienceYears: 3 });
    const r = await recommendJobsFor(s, cases.map(([, d]) => toCandidateJob(d)), { threshold: 0, useAi: false });
    const sent = r.jobs.map((j) => j.id);
    expect(sent).not.toContain("dev");
    expect(sent).not.toContain("mgr");
    expect(r.heldBackNoRequirements).toBe(2);
  });

  it("a title-only job is still scored in the app", () => {
    const s = seeker({ skills: ["React"], preferredRoles: ["developer"], totalExperienceYears: 3 });
    const r = calculateRelevance(s, toCandidateJob(doc("dev", "Developer")).profile);
    expect(r.overall).toBeGreaterThan(0);
    expect(checkEligibility(s, toCandidateJob(doc("dev", "Developer")).profile).eligible).toBe(true);
  });
});

describe("report rows shown for information (owner, 2026-11-12)", () => {
  it("a job with no education still shows the candidate's education, as Not required", () => {
    const s = seeker({ skills: ["React"], education: [{ degree: "B-Tech", field: "Computer Science and Engineering" }, { degree: "SSLC" }] });
    const j = job({ requirements: { skills: ["React"], experienceMin: 1, experienceMax: 5 } });
    const r = calculateRelevance(s, j);
    const report = buildRequirementReport(r.evaluation, r, j.requirements);
    const ed = report.items.find((i) => i.kind === "education");
    expect(ed).toMatchObject({ verdict: "info", mustHave: false, required: "", actual: "B-Tech · Computer Science and Engineering" });
    // Not a requirement: it counts toward nothing and scores nothing.
    expect(report.counts.info).toBe(0);
    expect(report.counts.has + report.counts.partial + report.counts.missing + report.counts.verify).toBe(report.items.length - 1);
    // Only the experience minimum is a must-have; the education row is not.
    expect(report.mustHaves.total).toBe(1);
    expect(r.shares.education).toBeUndefined();
  });

  it("and says so when the profile lists none", () => {
    const j = job({ requirements: { skills: ["React"] } });
    const r = calculateRelevance(seeker({ skills: ["React"] }), j);
    expect(buildRequirementReport(r.evaluation, r, j.requirements).items.find((i) => i.kind === "education")).toMatchObject({ verdict: "info", actual: "" });
  });
});

describe("experience copy is pluralised (owner, 2026-11-12)", () => {
  const fmt = (messages: typeof en, locale: string, who: "employer" | "seeker", key: "relevant" | "total", values: Record<string, unknown>) =>
    String(new IntlMessageFormat(messages.requirementReport.experience[who][key], locale).format(values));

  it("reads '1 year', not '1 years'", () => {
    expect(fmt(en, "en", "employer", "relevant", { relevant: 1, total: 1, roles: "QA" })).toBe("1 year relevant of 1 year in total (QA)");
    expect(fmt(en, "en", "employer", "relevant", { relevant: 2.4, total: 4, roles: "QA" })).toBe("2.4 years relevant of 4 years in total (QA)");
    expect(fmt(en, "en", "seeker", "total", { total: 1 })).toMatch(/^You have 1 year in total/);
  });

  it("the Arabic strings are valid plurals too", () => {
    for (const who of ["employer", "seeker"] as const) {
      expect(fmt(ar as typeof en, "ar", who, "relevant", { relevant: 1, total: 3, roles: "QA" })).toContain("سنة واحدة");
      expect(fmt(ar as typeof en, "ar", who, "total", { total: 5 })).toContain("5");
    }
  });
});

describe("language and driving 'skills' read from languages and licences (owner, 2026-11-12)", () => {
  const opsJob = () =>
    job({ title: "Operations Head", requirements: { skills: ["English proficiency", "Malayalam proficiency", "Driving", "Team leadership"] } });

  it("a language typed as a skill counts when the seeker lists the language", () => {
    const s = seeker({ skills: ["Team leadership"], languages: [{ language: "English" }, { language: "Malayalam" }] });
    const r = calculateRelevance(s, opsJob());
    expect(r.requiredMatched).toEqual(expect.arrayContaining(["English proficiency", "Malayalam proficiency"]));
  });

  it("Driving counts when the profile or CV names a driving licence, not any licence", () => {
    const withLicence = seeker({ skills: ["Team leadership"], certifications: ["UAE driving licence"] });
    expect(calculateRelevance(withLicence, opsJob()).requiredMatched).toContain("Driving");
    const nurse = seeker({ skills: ["Team leadership"], certifications: ["Nursing licence"] });
    expect(calculateRelevance(nurse, opsJob()).requiredMissing).toContain("Driving");
  });

  it("a language the seeker does not list stays missing", () => {
    const s = seeker({ skills: ["Team leadership"], languages: [{ language: "English" }] });
    expect(calculateRelevance(s, opsJob()).requiredMissing).toContain("Malayalam proficiency");
  });

  it("the report shows language names capitalised", () => {
    const s = seeker({ languages: [{ language: "english" }] });
    const j = job({ requirements: { languages: ["English", "Malayalam"], languagesConfirmedAt: new Date() } });
    const r = calculateRelevance(s, j);
    const row = buildRequirementReport(r.evaluation, r, j.requirements).items.find((i) => i.kind === "language");
    expect(row?.required).toBe("English, Malayalam");
    expect(row?.detail).toMatchObject({ have: ["English"], missing: ["Malayalam"] });
  });
});
