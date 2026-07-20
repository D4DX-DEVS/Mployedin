import { formatWeightsForPrompt, DEFAULT_WEIGHTS, type MatchingWeights } from "@/lib/ai/matchingWeights";

describe("formatWeightsForPrompt", () => {
  it("lists non-zero weights sorted descending", () => {
    const w: MatchingWeights = {
      skills: 50, experience: 30, education: 0,
      industryExperience: 15, preferredQualifications: 5,
    };
    const out = formatWeightsForPrompt(w);
    const lines = out.split("\n");
    expect(lines[0]).toBe("- Required skills match: 50%");
    expect(lines[1]).toMatch(/Relevant experience/);
    // Zero-weight signals (education) are omitted.
    expect(out).not.toMatch(/Education/);
    expect(lines).toHaveLength(4);
  });

  it("renders every default weight when all are non-zero", () => {
    expect(formatWeightsForPrompt(DEFAULT_WEIGHTS).split("\n")).toHaveLength(5);
  });

  it("defaults total exactly 100", () => {
    const total = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});
