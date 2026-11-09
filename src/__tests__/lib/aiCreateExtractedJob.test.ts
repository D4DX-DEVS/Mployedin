/**
 * @jest-environment node
 *
 * How the AI job creator applies the chat's answer to the draft on screen
 * (review 2026-11-09): only changed fields come back, a different job must not
 * inherit the old one's salary and benefits, and malformed output must not
 * reach the preview.
 */
import {
  applyDraftUpdate,
  experienceRange,
  isDifferentJob,
  normalizeDraft,
  type ExtractedJob,
} from "@/app/[locale]/(dashboard)/employer/jobs/ai-create/_components/extractedJob";

const WELDER: ExtractedJob = {
  title: "Welder",
  description: "Weld steel structures for a fabrication yard.",
  salary: { min: 2000, max: 3000, currency: "AED" },
  benefits: ["Accommodation"],
  vacancies: 5,
  requirements: { skills: ["MIG welding"], education: "ITI", experienceMin: 3, experienceMax: 8 },
  qualifications: ["ITI in welding"],
};

describe("applyDraftUpdate", () => {
  it("merges an answer that carries only the changed fields", () => {
    const next = applyDraftUpdate(WELDER, { qualifications: ["ITI in welding", "Valid welding certificate"] });
    expect(next.qualifications).toEqual(["ITI in welding", "Valid welding certificate"]);
    expect(next.salary).toEqual(WELDER.salary);
    expect(next.benefits).toEqual(["Accommodation"]);
  });

  it("merges a partial requirements object into the existing one", () => {
    const next = applyDraftUpdate(WELDER, { requirements: { skills: ["MIG welding", "TIG welding"] } });
    expect(next.requirements).toEqual({ skills: ["MIG welding", "TIG welding"], education: "ITI", experienceMin: 3, experienceMax: 8 });
  });

  it("replaces the draft with a different job instead of carrying the old salary and benefits over", () => {
    const next = applyDraftUpdate(WELDER, { title: "Nurse", description: "Care for patients on a busy ward.", requirements: { skills: ["Triage"] } });
    expect(next.title).toBe("Nurse");
    expect(next.salary).toBeUndefined();
    expect(next.benefits).toBeUndefined();
    expect(next.requirements).toEqual({ skills: ["Triage"] });
  });

  it("drops fields of the wrong type instead of handing them to the preview", () => {
    const next = applyDraftUpdate(WELDER, { qualifications: "Any degree", description: 42, benefits: ["Visa", 7] });
    expect(next.qualifications).toEqual(["ITI in welding"]);
    expect(next.description).toBe(WELDER.description);
    expect(next.benefits).toEqual(["Visa"]);
  });
});

describe("isDifferentJob", () => {
  it("is a new job only with a new title and a description of its own", () => {
    expect(isDifferentJob(WELDER, { title: "Senior Welder" })).toBe(false);
    expect(isDifferentJob(WELDER, { title: "Nurse", description: "Care for patients." })).toBe(true);
    expect(isDifferentJob(WELDER, { title: "welder", description: "Same job reworded." })).toBe(false);
    expect(isDifferentJob(null, { title: "Nurse", description: "x" })).toBe(false);
  });
});

describe("normalizeDraft", () => {
  it("reads numbers written as strings", () => {
    expect(normalizeDraft({ requirements: { experienceMin: "5", experienceMax: "" }, vacancies: "2" })).toEqual({
      requirements: { experienceMin: 5 },
      vacancies: 2,
    });
  });

  it("returns an empty draft for anything that is not an object", () => {
    expect(normalizeDraft("Operations Head")).toEqual({});
    expect(normalizeDraft([{ title: "x" }])).toEqual({});
  });
});

describe("experienceRange", () => {
  it.each([
    [{ experienceMin: 5, experienceMax: 0 }, { min: 5, max: undefined }],
    [{ experienceMin: 3, experienceMax: 2 }, { min: 3, max: undefined }],
    [{ experienceMin: 2, experienceMax: 5 }, { min: 2, max: 5 }],
    [{ experienceMin: 0, experienceMax: 0 }, {}],
    [{}, {}],
  ])("%j -> %j", (requirements, expected) => {
    expect(experienceRange({ requirements })).toEqual(expected);
  });
});
