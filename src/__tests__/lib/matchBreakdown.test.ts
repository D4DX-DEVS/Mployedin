/**
 * @jest-environment node
 */
import { isBreakdownMeasured } from "@/lib/matchBreakdown";

describe("isBreakdownMeasured", () => {
  it("rejects the legacy placeholder: zeroed components under a real score", () => {
    // Exactly what the pre-fix /api/ai/match wrote, and what QA photographed:
    // an "85% Excellent" badge above "Skills 0% / Experience 0%".
    expect(isBreakdownMeasured({ skills: 0, experience: 0, overall: 85 }, 85)).toBe(false);
  });

  it("accepts a breakdown with any recorded component", () => {
    expect(isBreakdownMeasured({ skills: 72, experience: 0, location: 100, salary: 50 }, 68)).toBe(true);
  });

  it("accepts a genuine zero match where the headline agrees", () => {
    expect(isBreakdownMeasured({ skills: 0, experience: 0, location: 0, salary: 0 }, 0)).toBe(true);
  });

  it("treats a missing or empty breakdown as unmeasured", () => {
    expect(isBreakdownMeasured(undefined, 85)).toBe(false);
    expect(isBreakdownMeasured(null, 85)).toBe(false);
    expect(isBreakdownMeasured({}, 85)).toBe(false);
    expect(isBreakdownMeasured({ overall: 85 }, 85)).toBe(false);
  });
});
