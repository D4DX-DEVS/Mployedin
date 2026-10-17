/**
 * scripts/backfill-matching.mjs is a plain .mjs with its own copies of the
 * app's helpers. If its vector pass drifts back to writing 3,072-number
 * arrays, or to treating only dims-3072 rows as cached, one run of it would
 * silently turn every skill vector back into the 42 KB form that made a cold
 * seeker home take 77 s (2026-10-16). Nothing at runtime would complain.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const script = readFileSync(path.resolve(__dirname, "../../../scripts/backfill-matching.mjs"), "utf8");

describe("scripts/backfill-matching.mjs keeps the app's skill-vector format", () => {
  it("writes 768 float32 dims", () => {
    expect(script).toMatch(/const SKILL_VECTOR_DIMENSIONS = 768;/);
    expect(script).toMatch(/writeFloatLE/);
    expect(script).toMatch(/vector: encodeSkillVector\(/);
    expect(script).toMatch(/dims: SKILL_VECTOR_DIMENSIONS,/);
    expect(script).not.toMatch(/vector: d\.vector\b/);
  });

  it("counts a cached row by its key, whatever shape it is stored in", () => {
    expect(script).not.toMatch(/dims: EMBEDDING_DIMENSIONS/);
  });
});
