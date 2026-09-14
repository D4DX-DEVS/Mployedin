/**
 * @jest-environment node
 */
import JobSeeker from "@/models/JobSeeker";

/**
 * Regression guard: /api/ai/cv-extract writes `cvExtractedByAI` and
 * `cvExtractedAt` after a successful parse. For months these were not declared
 * on the schema, so Mongoose (strict mode) silently discarded them and it was
 * impossible to tell which profiles the AI had filled in. Declaring a path here
 * is the only thing that makes the write persist, so assert on the schema itself.
 */
describe("JobSeeker schema — CV extraction flags", () => {
  it("declares cvExtractedByAI as a Boolean so the extractor's write persists", () => {
    const path = JobSeeker.schema.path("cvExtractedByAI");
    expect(path).toBeDefined();
    expect(path.instance).toBe("Boolean");
  });

  it("declares cvExtractedAt as a Date so the extractor's write persists", () => {
    const path = JobSeeker.schema.path("cvExtractedAt");
    expect(path).toBeDefined();
    expect(path.instance).toBe("Date");
  });

  it("keeps the flags when a document is built from the extractor's update shape", () => {
    // Mirrors the fields the route sets on success — see cv-extract/route.ts.
    const doc = new JobSeeker({
      userId: "000000000000000000000001",
      cvExtractedByAI: true,
      cvExtractedAt: new Date("2026-09-11T00:00:00Z"),
    });
    expect(doc.get("cvExtractedByAI")).toBe(true);
    expect(doc.get("cvExtractedAt")).toEqual(new Date("2026-09-11T00:00:00Z"));
  });
});
