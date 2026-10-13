import { extractProfession, professionBreakdown, PROFESSION_NOT_SPECIFIED, PROFESSION_OTHER } from "@/lib/jobseekers/profession";

describe("extractProfession", () => {
  it("prefers the role they want, then the career profile, then the current job title", () => {
    expect(extractProfession({ careerProfile: { jobRole: "Nurse" }, preferredRoles: ["Doctor"] })).toBe("Doctor");
    expect(extractProfession({ preferredRoles: ["", "heavy truck driver"] })).toBe("Heavy Truck Driver");
    expect(extractProfession({ careerProfile: { jobRole: "Accountant – Imutsa, Kochi (2019–present)" } })).toBe("Accountant");
    expect(extractProfession({ experience: [{ jobTitle: "Old", isCurrent: false }, { jobTitle: "Site Supervisor at BuildCo", isCurrent: true }] })).toBe("Site Supervisor");
  });

  it("drops a job title that is a whole CV line it cannot cut down", () => {
    const long = "Business development and partnerships lead for the whole GCC region and beyond";
    expect(extractProfession({ experience: [{ jobTitle: long, isCurrent: true }] })).toBe(PROFESSION_NOT_SPECIFIED);
  });

  it("skips non-answers", () => {
    expect(extractProfession({ preferredRoles: ["No prior work experience (fresher)"], careerProfile: { jobRole: "Currently Seeking" } })).toBe(PROFESSION_NOT_SPECIFIED);
    expect(extractProfession({ preferredRoles: ["Currently seeking"], careerProfile: { jobRole: "Store Keeper" } })).toBe("Store Keeper");
  });

  it("is Not specified with nothing to go on", () => {
    expect(extractProfession({})).toBe(PROFESSION_NOT_SPECIFIED);
  });
});

describe("professionBreakdown", () => {
  it("keeps the top professions, folds the rest into Other and lists Not specified last", () => {
    const seekers = [
      ...Array.from({ length: 3 }, () => ({ careerProfile: { jobRole: "Driver" } })),
      ...Array.from({ length: 12 }, (_, i) => ({ careerProfile: { jobRole: `Role ${String.fromCharCode(65 + i)}` } })),
      {},
    ];
    const rows = professionBreakdown(seekers, 10);
    expect(rows[0]).toEqual({ profession: "Driver", count: 3 });
    expect(rows).toHaveLength(12);
    expect(rows[10]).toEqual({ profession: PROFESSION_OTHER, count: 3 });
    expect(rows[11]).toEqual({ profession: PROFESSION_NOT_SPECIFIED, count: 1 });
  });
});
