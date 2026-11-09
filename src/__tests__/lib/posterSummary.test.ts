import { summarizeDraft } from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/_components/posterSummary";

describe("summarizeDraft — what a poster gave and what it left out", () => {
  it("counts the lists the poster filled and names the rest (Solid Business Club poster)", () => {
    const summary = summarizeDraft({
      title: "Operations Head",
      qualifications: ["Any Degree", "Fluent in Malayalam & English", "Ready to Learn and Lead", "2 or 4 Wheeler Driving License", "Familiar with IT Tools", "Ready to Travel"],
      requirements: { skills: ["Malayalam", "English", "Driving", "IT tools"], experienceMin: 0, experienceMax: 0 },
      salary: { min: 0, max: 0, currency: "INR" },
    });
    expect(summary.found).toEqual([
      { key: "qualifications", count: 6 },
      { key: "skills", count: 4 },
    ]);
    expect(summary.missing).toEqual(["responsibilities", "benefits", "salary", "experience"]);
  });

  it("drops a request once the draft has it, and ignores blank items", () => {
    const summary = summarizeDraft({
      responsibilities: ["Lead operations"],
      benefits: ["  "],
      qualifications: ["Any degree"],
      salary: { isNegotiable: true },
      requirements: { experienceMin: 5 },
    });
    expect(summary.missing).toEqual(["benefits"]);
    expect(summary.found.map((f) => f.key)).toEqual(["qualifications", "responsibilities"]);
  });

  it("reads an older draft whose requirements are a bare skills array", () => {
    expect(summarizeDraft({ requirements: ["Excel", ""] }).found).toEqual([{ key: "skills", count: 1 }]);
  });
});
