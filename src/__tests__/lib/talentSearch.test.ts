import { roleStems } from "@/lib/jobseekers/talentSearch";
import { presentToolResult } from "@/lib/ai/copilot/views";

jest.mock("@/models/JobSeeker", () => ({}));
jest.mock("@/models/User", () => ({}));

describe("roleStems", () => {
  it("keeps the role words and drops filler from a brief", () => {
    const stems = roleStems("2 year experienced electrical engineers");
    expect(stems).toHaveLength(2);
    expect(stems.every((re) => re.test("Senior Electrical Design Engineer"))).toBe(true);
    expect(stems.every((re) => re.test("Electrical & Electronics Engineering"))).toBe(true);
  });

  it("does not treat an electrician as an electrical engineer", () => {
    const stems = roleStems("electrical engineer");
    expect(stems.every((re) => re.test("Electrician"))).toBe(false);
  });
});

describe("find_candidates view", () => {
  it("keeps every ranked row and labels the brief", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      seekerId: `id${i}`, name: `C${i}`, skills: ["AutoCAD"], matchedSkills: [], hasCV: i % 2 === 0, fit: 90 - i,
      locationFit: "current", experienceFit: "meets",
    }));
    const view = presentToolResult("find_candidates", {
      candidates, totalMatched: 13, relaxed: false, brief: { role: "electrical engineer", location: "Kuwait", minYears: 2 },
    });
    expect(view).toMatchObject({ kind: "talent", totalMatched: 13, brief: "electrical engineer · Kuwait · 2+ yrs" });
    expect(view && view.kind === "talent" && view.talent).toHaveLength(10);
  });

  it("draws nothing for an empty result", () => {
    expect(presentToolResult("find_candidates", { candidates: [], totalMatched: 0, relaxed: false })).toBeNull();
  });
});
