/**
 * @jest-environment node
 */
import { computeGaps, DEFAULT_GAP_OPTIONS, type GapJob, type GapSeeker } from "@/lib/marketGaps/compute";
import { roleKey } from "@/lib/matching/roleMatch";

const now = new Date("2026-11-09T00:00:00Z");
const opts = { ...DEFAULT_GAP_OPTIONS, now };
const old = new Date("2026-09-01T00:00:00Z");

function seekers(n: number, area: string | null, roles: string[], skills: string[] = ["wiring"]): GapSeeker[] {
  return Array.from({ length: n }, (_, i) => ({ id: `${area}-${roles[0]}-${i}`, areaId: area, roles, skills, createdAt: old }));
}
function job(title: string, area: string | null, ageDays = 1, remote = false): GapJob {
  return { id: `${title}-${area}-${ageDays}`, areaId: area, remote, title, createdAt: new Date(now.getTime() - ageDays * 86400000) };
}

describe("roleKey", () => {
  test("groups seniority variants together", () => {
    expect(roleKey("Senior Electrician")).toBe(roleKey("Electrician"));
  });
  test("is empty for a title with no real word", () => {
    expect(roleKey("Senior")).toBe("");
  });
});

describe("computeGaps", () => {
  test("seekers with no job of their kind in the area need employers", () => {
    const r = computeGaps(seekers(8, "sharjah", ["Electrician"]), [job("Driver", "sharjah")], opts);
    const s = r.suggestions.find((x) => x.kind === "find_employers");
    expect(s).toMatchObject({ areaId: "sharjah", seekers: 8, jobs: 0, role: "Electrician" });
  });

  test("a matching job in the same area closes the gap", () => {
    const r = computeGaps(seekers(8, "sharjah", ["Electrician"]), [job("Senior Electrician", "sharjah")], opts);
    expect(r.suggestions.find((x) => x.kind === "find_employers")).toBeUndefined();
  });

  test("a job in another area does not close it", () => {
    const r = computeGaps(seekers(8, "sharjah", ["Electrician"]), [job("Electrician", "dubai")], opts);
    expect(r.suggestions.some((x) => x.kind === "find_employers")).toBe(true);
  });

  test("a remote job anywhere does close it", () => {
    const r = computeGaps(seekers(8, "sharjah", ["Electrician"]), [job("Electrician", "dubai", 1, true)], opts);
    expect(r.suggestions.some((x) => x.kind === "find_employers")).toBe(false);
  });

  test("many seekers per job is thin supply", () => {
    const r = computeGaps(seekers(31, "ajman", ["Driver"]), [job("Driver", "ajman"), job("Driver", "ajman")], opts);
    expect(r.suggestions.find((x) => x.kind === "thin_supply")).toMatchObject({ seekers: 31, jobs: 2, priority: "high" });
  });

  test("a gap below the minimum is not worth a suggestion", () => {
    expect(computeGaps(seekers(4, "sharjah", ["Electrician"]), [], opts).suggestions).toHaveLength(0);
  });

  test("an old job nobody matches asks for seekers", () => {
    const r = computeGaps(seekers(1, "dubai", ["Nurse"]), [job("Staff Nurse", "dubai", 20)], opts);
    expect(r.suggestions.find((x) => x.kind === "find_seekers")).toMatchObject({ areaId: "dubai", jobs: 1 });
  });

  test("a fresh job is given time", () => {
    const r = computeGaps([], [job("Staff Nurse", "dubai", 2)], opts);
    expect(r.suggestions).toHaveLength(0);
  });

  test("seekers with no area become a data fix, not a market gap", () => {
    const r = computeGaps(seekers(12, null, ["Electrician"]), [], opts);
    expect(r.noAreaCount).toBe(12);
    expect(r.suggestions).toEqual([expect.objectContaining({ kind: "fix_data", seekers: 12 })]);
  });

  test("reports top skills and a sample", () => {
    const r = computeGaps(seekers(6, "sharjah", ["Electrician"], ["wiring", "plc"]), [], opts);
    expect(r.suggestions[0].topSkills[0]).toEqual({ skill: "plc", count: 6 });
    expect(r.suggestions[0].sampleSeekerIds.length).toBe(6);
  });

  test("keys are stable between runs", () => {
    const a = computeGaps(seekers(8, "sharjah", ["Electrician"]), [], opts).suggestions[0].key;
    const b = computeGaps(seekers(9, "sharjah", ["Senior Electrician"]), [], opts).suggestions[0].key;
    expect(a).toBe(b);
  });
});
