import { cleanRoleTitle } from "@/lib/jobseekers/roleTitle";
import { addRoleEvidence, suggestRoleFromSkills, type SkillRoleIndex } from "@/lib/jobseekers/suggestedRole";

describe("cleanRoleTitle", () => {
  it("drops the employer, city and date range an imported CV put in the title", () => {
    expect(cleanRoleTitle("Senior Executive Sales – Tulsyan Smelters Pvt. Ltd., Cochin (2024 – Present)")).toBe("Senior Executive Sales");
  });

  it("leaves a clean title alone", () => {
    expect(cleanRoleTitle("Heavy Truck Driver")).toBe("Heavy Truck Driver");
    expect(cleanRoleTitle("Sales - Marketing Manager")).toBe("Sales - Marketing Manager");
  });

  it("cuts a plain hyphen only when an employer follows", () => {
    expect(cleanRoleTitle("Electrician - Al Fajr Contracting LLC")).toBe("Electrician");
  });

  it("handles pipes, @ and a trailing year range", () => {
    expect(cleanRoleTitle("Accountant | Gulf Trading")).toBe("Accountant");
    expect(cleanRoleTitle("Storekeeper @ Noon")).toBe("Storekeeper");
    expect(cleanRoleTitle("Site Engineer 2019 - 2022")).toBe("Site Engineer");
  });

  it("is empty for nothing", () => {
    expect(cleanRoleTitle(undefined)).toBe("");
    expect(cleanRoleTitle("   ")).toBe("");
  });

  it("shortens a very long run-on title", () => {
    const out = cleanRoleTitle(`Operations lead, ${"responsible for many things ".repeat(5)}`);
    expect(out).toBe("Operations lead");
  });
});

describe("suggestRoleFromSkills", () => {
  const repeat = (n: number, skills: string[], title: string, index: SkillRoleIndex) => {
    for (let i = 0; i < n; i += 1) addRoleEvidence(index, skills, title);
  };
  const build = (): SkillRoleIndex => {
    const index: SkillRoleIndex = new Map();
    repeat(5, ["Driving", "Logistics"], "Heavy Truck Driver", index);
    repeat(2, ["Driving"], "Truck Driver", index);
    repeat(5, ["Wiring", "Electrical Safety"], "Electrician", index);
    // A skill every trade lists: no one role dominates it.
    for (const title of ["Electrician", "Heavy Truck Driver", "Accountant", "Storekeeper", "Welder", "Cook"]) {
      repeat(1, ["Teamwork"], title, index);
    }
    return index;
  };

  it("suggests the role the skills agree on, in its most common wording", () => {
    expect(suggestRoleFromSkills(["Driving", "Logistics"], build())).toBe("Heavy Truck Driver");
  });

  it("matches skills case-insensitively", () => {
    expect(suggestRoleFromSkills(["wiring", "ELECTRICAL SAFETY"], build())).toBe("Electrician");
  });

  it("says nothing when the skills point at different roles", () => {
    expect(suggestRoleFromSkills(["Driving", "Wiring"], build())).toBeUndefined();
  });

  it("ignores a skill that every trade lists", () => {
    expect(suggestRoleFromSkills(["Teamwork"], build())).toBeUndefined();
  });

  it("says nothing for skills it has never seen, or none", () => {
    expect(suggestRoleFromSkills(["Pottery", "Falconry"], build())).toBeUndefined();
    expect(suggestRoleFromSkills([], build())).toBeUndefined();
  });

  it("does not guess from thin evidence", () => {
    const index: SkillRoleIndex = new Map();
    repeat(2, ["Welding", "Fabrication"], "Welder", index);
    expect(suggestRoleFromSkills(["Welding", "Fabrication"], index)).toBeUndefined();
  });
});
