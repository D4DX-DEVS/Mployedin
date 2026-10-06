/**
 * @jest-environment node
 */
import Application from "@/models/Application";

/**
 * Regression guard (2026-10-06): POST /api/applications passed `coverLetter`
 * to Application.create, but the schema declared no such path, so strict mode
 * dropped every letter — 0 of 85 stored, while 6 applications were scored as
 * carrying a customised one. Declaring the path is what makes the write stick.
 */
describe("Application schema — cover letter", () => {
  it("declares coverLetter as a String", () => {
    const path = Application.schema.path("coverLetter");
    expect(path).toBeDefined();
    expect(path.instance).toBe("String");
  });

  it("keeps the letter on a document built from the apply handler's shape", () => {
    const doc = new Application({
      jobSeekerId: "000000000000000000000001",
      jobId: "000000000000000000000002",
      employerId: "000000000000000000000003",
      coverLetter: "  I have five years of React experience.  ",
    });
    expect(doc.coverLetter).toBe("I have five years of React experience.");
  });
});
