/** @jest-environment node */
import { checkQualificationLine, checkQualificationLines, evidenceFromSeeker, type EvidenceDoc } from "@/lib/matching/qualificationLines";

const devops: EvidenceDoc = {
  headline: "Senior IT Project Manager",
  skills: ["Bash/Python Scripting", "Docker"],
  education: [{ degree: "Master of Science", field: "Computer Science" }],
  experience: [
    { jobTitle: "IT Project Manager", company: "Acme", description: "Ran cloud migrations on AWS and managed delivery teams across regions.", startDate: "2000-01-01", isCurrent: true },
  ],
  languages: [{ language: "English" }, { language: "Hindi" }],
  totalExperienceYears: 24,
};
const ev = evidenceFromSeeker(devops);

describe("checkQualificationLine", () => {
  it("education: held level against the level the line names", () => {
    const check = checkQualificationLine("Bachelor's degree in Computer Science, Engineering, or related field", ev);
    expect(check).toMatchObject({ kind: "education", verdict: "has", required: 3, actual: 4 });
  });

  it("education: one level short is partial, two is missing, none stated is unknown", () => {
    const line = "Master's degree required";
    expect(checkQualificationLine(line, { ...ev, educationLevel: 3 }).verdict).toBe("partial");
    expect(checkQualificationLine(line, { ...ev, educationLevel: 2 }).verdict).toBe("missing");
    expect(checkQualificationLine(line, { ...ev, educationLevel: 0 }).verdict).toBe("unknown");
  });

  it("does not read 'utilities' as a diploma", () => {
    expect(checkQualificationLine("Knowledge of utilities billing", ev).kind).not.toBe("education");
  });

  it("years: compared with the candidate's total experience", () => {
    expect(checkQualificationLine("3–5 years of relevant accounting experience", ev)).toMatchObject({ kind: "experience", verdict: "has", required: 3 });
    expect(checkQualificationLine("30+ years in logistics", ev).verdict).toBe("missing");
    expect(checkQualificationLine("3 years of experience", { ...ev, yearsKnown: false }).verdict).toBe("unknown");
  });

  it("languages: has, partly, or not listed", () => {
    expect(checkQualificationLine("Fluency in Hindi and English", ev)).toMatchObject({ kind: "language", verdict: "has", found: ["english", "hindi"] });
    expect(checkQualificationLine("Fluency in Malayalam and English", ev)).toMatchObject({ verdict: "partial", found: ["english"], missing: ["malayalam"] });
    expect(checkQualificationLine("Fluent in Spanish", ev)).toMatchObject({ verdict: "missing", missing: ["spanish"] });
  });

  it("terms: found through the profile text and related tools", () => {
    expect(checkQualificationLine("Strong understanding of cloud computing principles", ev)).toMatchObject({ kind: "terms", found: expect.arrayContaining(["cloud"]) });
    // "containerization" is evidenced by Docker.
    expect(checkQualificationLine("Basic knowledge of containerization and orchestration tools", ev).found).toContain("containerization");
  });

  it("terms: nothing on a profile with plenty of text is a miss", () => {
    const check = checkQualificationLine("Working knowledge of GST returns, E-Way Bills, and TDS", {
      ...ev,
      text: "project management delivery of software programmes ".repeat(10),
    });
    expect(check).toMatchObject({ kind: "terms", verdict: "missing" });
    expect(check.missing).toEqual(expect.arrayContaining(["gst", "tds"]));
  });

  it("personal qualities are 'unknown', never a miss", () => {
    expect(checkQualificationLine("Excellent problem-solving skills and willingness to learn", ev)).toMatchObject({ kind: "personal", verdict: "unknown" });
  });

  it("a profile with almost no text is 'unknown' rather than a miss", () => {
    const thin = evidenceFromSeeker({ skills: ["x"] });
    expect(checkQualificationLine("Working knowledge of GST returns", thin)).toMatchObject({ kind: "thin", verdict: "unknown" });
  });
});

describe("checkQualificationLines", () => {
  it("keeps the employer's order, drops blanks, caps at 20", () => {
    const lines = ["Bachelor's degree", "  ", ...Array.from({ length: 30 }, (_, i) => `Knowledge of tool${i}`)];
    const out = checkQualificationLines(lines, ev);
    expect(out).toHaveLength(20);
    expect(out[0].line).toBe("Bachelor's degree");
  });

  it("returns nothing when the job lists none", () => {
    expect(checkQualificationLines(undefined, ev)).toEqual([]);
  });
});

describe("quotes", () => {
  it("quotes where the profile mentions a term, so the reader can judge it", () => {
    const check = checkQualificationLine("Strong understanding of cloud computing principles", ev);
    expect(check.quotes?.length).toBeGreaterThan(0);
    expect(check.quotes?.[0]).toMatch(/cloud/);
  });

  it("has no quotes when nothing was found", () => {
    const check = checkQualificationLine("Working knowledge of GST returns", { ...ev, text: "project management ".repeat(15) });
    expect(check.quotes).toBeUndefined();
  });
});
