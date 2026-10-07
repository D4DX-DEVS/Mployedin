/**
 * @jest-environment node
 *
 * QA EMP-010/011 (2026-10-06): the job wizard said "Invalid input" for 1.5
 * years, said nothing for -1 years, had no message past 200 title characters,
 * took "<b>x</b>" as a title, and the edit page saved -3 openings as 1.
 */
import { jobFormSchema } from "@/components/features/employer/job-form/jobFormSchema";
import { jobCreateSchema, jobUpdateSchema } from "@/lib/validators/jobs";
import { containsMarkup, PLAIN_TEXT_ERROR } from "@/lib/validators/plainText";

const baseForm = {
  title: "Senior Backend Engineer",
  location: { country: "AE", city: "Dubai", isRemote: false },
  description: "We are hiring a backend engineer to build and run our APIs.",
  requirements: { skills: [], preferredSkills: [], experienceMin: 2, experienceMax: 8 },
  salary: { min: 5000, max: 9000, currency: "USD", isNegotiable: false, period: "monthly" },
};

function issueAt(input: unknown, path: string) {
  const res = jobFormSchema.safeParse(input);
  if (res.success) return undefined;
  return res.error.issues.find((i) => i.path.join(".") === path);
}

describe("containsMarkup", () => {
  it.each(["<b>x</b>", "Engineer</div>", "<img src=x onerror=alert(1)>", "<!-- hi -->", "<B>Lead</B>"])(
    "flags %j",
    (value) => expect(containsMarkup(value)).toBe(true),
  );

  it.each(["C++ Developer", "Sales < 5 yrs", "R&D Lead", "Engineer (Night shift) > Level 2", "مهندس برمجيات"])(
    "lets %j through",
    (value) => expect(containsMarkup(value)).toBe(false),
  );
});

describe("jobFormSchema field messages", () => {
  it.each([
    ["a fraction", 1.5],
    ["a negative number", -1],
    ["more than 50", 51],
    ["a blank box (NaN)", Number.NaN],
  ])("names the rule for %s of minimum years", (_label, value) => {
    const issue = issueAt({ ...baseForm, requirements: { ...baseForm.requirements, experienceMin: value } }, "requirements.experienceMin");
    expect(issue?.message).toBe("Enter whole years from 0 to 50");
  });

  it("keeps the min > max rule as its own (custom) issue on the maximum", () => {
    const issue = issueAt(
      { ...baseForm, requirements: { ...baseForm.requirements, experienceMin: 9, experienceMax: 3 } },
      "requirements.experienceMax",
    );
    expect(issue?.code).toBe("custom");
  });

  it("says when a title is too long", () => {
    const issue = issueAt({ ...baseForm, title: "x".repeat(201) }, "title");
    expect(issue?.code).toBe("too_big");
    expect(issue?.message).toBe("Title must be 200 characters or fewer");
  });

  it("refuses markup in the title", () => {
    const issue = issueAt({ ...baseForm, title: "<b>Backend Engineer</b>" }, "title");
    expect(issue?.code).toBe("custom");
    expect(issue?.message).toBe(PLAIN_TEXT_ERROR);
  });

  it.each([-3, 0, 2.5, 101])("refuses %s openings with a message", (value) => {
    expect(issueAt({ ...baseForm, vacancies: value }, "vacancies")?.message).toBe(
      "Enter a whole number of openings from 1 to 100",
    );
  });

  it("still accepts a normal job with openings", () => {
    expect(jobFormSchema.safeParse({ ...baseForm, vacancies: 3 }).success).toBe(true);
  });
});

describe("server job schemas", () => {
  const serverBase = {
    title: "Senior Backend Engineer",
    description: "We are hiring a backend engineer to build and run our APIs.",
  };

  it("refuses a markup title on create and on edit", () => {
    expect(jobCreateSchema.safeParse({ ...serverBase, title: "<b>x</b> Engineer" }).success).toBe(false);
    expect(jobUpdateSchema.safeParse({ title: "<script>x</script> Lead" }).success).toBe(false);
  });

  it("still accepts plain titles, with or without an update title", () => {
    expect(jobCreateSchema.safeParse({ ...serverBase, title: "C++ Developer < 5 yrs" }).success).toBe(true);
    expect(jobUpdateSchema.safeParse({ description: serverBase.description }).success).toBe(true);
  });
});
