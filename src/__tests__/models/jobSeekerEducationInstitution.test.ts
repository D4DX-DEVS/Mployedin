/**
 * @jest-environment node
 */
import JobSeeker from "@/models/JobSeeker";

/**
 * 12th, 10th and Below 10th have no university. With `institution` required,
 * such an entry saved through the profile route (which skips validators) and
 * then failed every later `seeker.save()` — denying a suggested skill among them.
 */
describe("JobSeeker education institution", () => {
  const seeker = (institution?: string) =>
    new JobSeeker({
      userId: "507f1f77bcf86cd799439011",
      fullName: "QA",
      education: [{ degree: "12th", ...(institution === undefined ? {} : { institution }) }],
    });

  it("accepts a school-level entry with no university", () => {
    expect(seeker("").validateSync()?.errors?.["education.0.institution"]).toBeUndefined();
    expect(seeker().validateSync()?.errors?.["education.0.institution"]).toBeUndefined();
  });

  it("still requires the degree", () => {
    const doc = new JobSeeker({ userId: "507f1f77bcf86cd799439011", fullName: "QA", education: [{ institution: "IIT" }] });
    expect(doc.validateSync()?.errors?.["education.0.degree"]).toBeDefined();
  });
});
