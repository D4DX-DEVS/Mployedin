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

/**
 * The stored copy of the CV built on Mployedin is told apart from the seeker's
 * own uploads by `builtHash` (cv/built-cv.ts). Undeclared, strict mode drops
 * it: the copy is then never reused or replaced, so every application sent
 * with the built CV stores — and pays to read — another file.
 */
describe("JobSeeker schema — built CV marker", () => {
  it("keeps builtHash on a document, and leaves an ordinary upload without one", () => {
    const doc = new JobSeeker({
      userId: "000000000000000000000001",
      documents: [
        { id: "b1", name: "Antony - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", builtHash: "1193b985483aa0" },
        { id: "d1", name: "Resume.pdf", category: "resume", url: "https://cdn/documents/resume.pdf" },
      ],
    });
    const [built, uploaded] = doc.toObject().documents;
    expect(built.builtHash).toBe("1193b985483aa0");
    expect(uploaded.builtHash).toBeUndefined();
  });
});
