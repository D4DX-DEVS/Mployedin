/**
 * @jest-environment node
 *
 * The matching vector is 1024 numbers per document. It stays out of every
 * query unless a caller asks for it with "+matchEmbedding", like the old
 * searchEmbedding, and the refresh sweep finds changed documents by updatedAt.
 */
import fs from "node:fs";
import path from "node:path";
import Job from "@/models/Job";
import JobSeeker from "@/models/JobSeeker";

describe("matching vector fields", () => {
  it.each([
    ["Job", Job],
    ["JobSeeker", JobSeeker],
  ] as const)("%s stores the vector, its model, its time and its text hash", (_name, Model) => {
    expect(Model.schema.path("matchEmbedding")?.options.select).toBe(false);
    expect(Model.schema.path("matchTextHash")?.options.select).toBe(false);
    expect(Model.schema.path("matchEmbeddingAt")).toBeDefined();
    expect(Model.schema.path("matchEmbeddingModel")).toBeDefined();
  });

  it("indexes updatedAt on jobs and jobseekers for the refresh sweep", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src/lib/db/indexes.ts"), "utf8");
    for (const collection of ["jobs", "jobseekers"]) {
      const block = src.split(`safeCreateIndexes(db, "${collection}", [`)[1].split("]);")[0];
      expect(block).toContain("{ key: { updatedAt: -1 } }");
    }
  });
});
