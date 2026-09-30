/**
 * The employer's "why this score" rows (client report 2026-09-30, #9): a part
 * the candidate gave nothing for reads "Not provided" instead of a weak-looking
 * percentage, the CV gets its own row, and each measured part says how strong
 * it is — "Skills: Strong · Experience: Not provided · CV: Not provided".
 */
import { fitWord, matchBreakdownRows } from "@/components/features/employer/applications/matchBreakdownRows";

const check = (key: string, status: "met" | "partial" | "not_met" | "unknown", actual?: string) =>
  ({ key, status, hard: key !== "cv", ...(actual ? { actual } : {}) });

describe("matchBreakdownRows", () => {
  it("shows the client's case as strong skills with experience and CV not provided", () => {
    const rows = matchBreakdownRows(
      { skills: 75, role: 25, experience: 25, overall: 50 },
      [check("experience", "unknown"), check("skills", "met"), check("cv", "unknown", "none")],
    );
    expect(rows).toEqual([
      { key: "skills", value: 75, fit: "strong" },
      { key: "roleFit", value: 25, fit: "weak" },
      { key: "experience", value: null, state: "not_provided" },
      { key: "cv", value: null, state: "not_provided" },
    ]);
  });

  it("marks unlisted education as not provided, and keeps a measured part as a bar", () => {
    const rows = matchBreakdownRows(
      { skills: 40, role: 90, experience: 100, education: 25, overall: 60 },
      [check("experience", "met"), check("education", "unknown")],
    );
    expect(rows.find((r) => r.key === "experience")).toEqual({ key: "experience", value: 100, fit: "strong" });
    expect(rows.find((r) => r.key === "education")).toEqual({ key: "education", value: null, state: "not_provided" });
    expect(rows.find((r) => r.key === "skills")).toEqual({ key: "skills", value: 40, fit: "weak" });
  });

  it("names the CV's state when there is one", () => {
    for (const state of ["read", "reading", "unreadable"] as const) {
      const rows = matchBreakdownRows({ skills: 80, role: 50, experience: 50, overall: 60 }, [check("cv", "met", state)]);
      expect(rows.at(-1)).toEqual({ key: "cv", value: null, state });
    }
  });

  it("reads an older row without a checklist as before, dropping parts never scored", () => {
    const rows = matchBreakdownRows({ skills: 60, role: 0, experience: 55, location: 100, overall: 58 }, undefined);
    expect(rows.map((r) => r.key)).toEqual(["skills", "roleFit", "experience", "location"]);
    expect(rows.every((r) => r.value !== null)).toBe(true);
  });

  it("words a part the way the bar colours it", () => {
    expect([fitWord(70), fitWord(69), fitWord(50), fitWord(49)]).toEqual(["strong", "fair", "fair", "weak"]);
  });
});
