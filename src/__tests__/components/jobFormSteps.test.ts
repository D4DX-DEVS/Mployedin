/**
 * Bug report 2026-10-28: admin "Post Job" did nothing. A cleared "Max
 * applicants" box (Advanced settings, step 4) failed validation while the
 * person was on step 5, and no step owned that field, so nothing said why.
 */
import { jobFormSchema } from "@/components/features/employer/job-form/jobFormSchema";
import { STEP_FIELDS, assistantStartersForStep, firstInvalidStep, stepToViewAssistChanges } from "@/components/features/employer/job-form/jobFormSteps";

describe("STEP_FIELDS", () => {
  it("gives every field of the job form a step, so no invalid field is ever invisible", () => {
    const owned = new Set(Object.values(STEP_FIELDS).flat());
    const unowned = Object.keys(jobFormSchema.shape).filter((field) => !owned.has(field as never));
    expect(unowned).toEqual([]);
  });
});

describe("stepToViewAssistChanges", () => {
  it("opens the next step that holds what the assistant wrote", () => {
    // "Write the description" from step 1: the title is here, the rest is on step 2.
    expect(stepToViewAssistChanges(["title", "description", "responsibilities", "skills"], 1)).toBe(2);
  });

  it("maps the assistant's own field names to their step", () => {
    expect(stepToViewAssistChanges(["skills"], 1)).toBe(2);
    expect(stepToViewAssistChanges(["addScreeningQuestions"], 1)).toBe(3);
    expect(stepToViewAssistChanges(["salary"], 2)).toBe(3);
  });

  it("goes back when the only change is on an earlier step", () => {
    expect(stepToViewAssistChanges(["title"], 3)).toBe(1);
  });

  it("stays put when every change is already on screen", () => {
    expect(stepToViewAssistChanges(["description", "benefits"], 2)).toBe(2);
    expect(stepToViewAssistChanges([], 2)).toBe(2);
  });
});

describe("firstInvalidStep", () => {
  it("finds the step of an Advanced settings field", () => {
    expect(firstInvalidStep(["maxApplicants"])).toBe(3);
  });

  it("returns the earliest step when several fields fail", () => {
    expect(firstInvalidStep(["screeningQuestions", "responsibilities", "maxApplicants"])).toBe(2);
  });

  it("reads nested paths by their root field", () => {
    expect(firstInvalidStep(["location.city"])).toBe(1);
  });

  it("returns null when nothing maps to a step", () => {
    expect(firstInvalidStep([])).toBeNull();
    expect(firstInvalidStep(["somethingElse"])).toBeNull();
  });
});

describe("assistantStartersForStep", () => {
  it("offers two starters on every step, always with 'fill in what's missing'", () => {
    for (const step of [1, 2, 3]) {
      const starters = assistantStartersForStep(step);
      expect(starters).toHaveLength(2);
      expect(starters[0]).toBe("fillMissing");
    }
  });

  it("does not repeat a button the open step already has", () => {
    expect(assistantStartersForStep(2)).not.toContain("description");
    expect(assistantStartersForStep(3)).not.toContain("questions");
  });

  it("returns the same array for the same step, so the starters are not rebuilt each render", () => {
    expect(assistantStartersForStep(2)).toBe(assistantStartersForStep(2));
  });

  it("puts the company-visibility choice on the last step", () => {
    expect(STEP_FIELDS[3]).toContain("discloseCompany");
    expect(STEP_FIELDS[1]).not.toContain("discloseCompany");
  });
});
