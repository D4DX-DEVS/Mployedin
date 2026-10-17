import { cosine, SKILL_VECTOR_DIMENSIONS, toSkillVector } from "@/lib/matching/skillSimilarity";

const FULL = 3072;
const norm = (v: readonly number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe("toSkillVector", () => {
  it("keeps the first 768 dimensions of a full Gemini vector and renormalizes", () => {
    const full = Array.from({ length: FULL }, (_, i) => (i % 7) - 3);
    const v = toSkillVector(full);
    expect(v).not.toBeNull();
    expect(v).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(norm(v!)).toBeCloseTo(1, 9);
    // Same direction as the prefix: cosine with the prefix is 1.
    expect(cosine(v!, full.slice(0, SKILL_VECTOR_DIMENSIONS))).toBeCloseTo(1, 9);
  });

  it("renormalizes a vector that is already 768 long", () => {
    const v = toSkillVector(Array.from({ length: SKILL_VECTOR_DIMENSIONS }, () => 2));
    expect(v).toHaveLength(SKILL_VECTOR_DIMENSIONS);
    expect(v![0]).toBeCloseTo(1 / Math.sqrt(SKILL_VECTOR_DIMENSIONS), 12);
  });

  it("refuses a vector that is too short or all zero", () => {
    expect(toSkillVector(Array.from({ length: 512 }, () => 1))).toBeNull();
    expect(toSkillVector(new Array(FULL).fill(0))).toBeNull();
  });
});
