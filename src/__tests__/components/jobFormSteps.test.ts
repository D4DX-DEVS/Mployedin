/**
 * Bug report 2026-10-28: admin "Post Job" did nothing. A cleared "Max
 * applicants" box (Advanced settings, step 4) failed validation while the
 * person was on step 5, and no step owned that field, so nothing said why.
 */
import { jobFormSchema } from "@/components/features/employer/job-form/jobFormSchema";
import { STEP_FIELDS, firstInvalidStep } from "@/components/features/employer/job-form/jobFormSteps";

describe("STEP_FIELDS", () => {
  it("gives every field of the job form a step, so no invalid field is ever invisible", () => {
    const owned = new Set(Object.values(STEP_FIELDS).flat());
    const unowned = Object.keys(jobFormSchema.shape).filter((field) => !owned.has(field as never));
    expect(unowned).toEqual([]);
  });
});

describe("firstInvalidStep", () => {
  it("finds the step of an Advanced settings field", () => {
    expect(firstInvalidStep(["maxApplicants"])).toBe(4);
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
