import { parseCsv, parseImportRows, validateImportRow, jobDraftFromRow } from "@/lib/admin/bulkImport";

describe("parseCsv", () => {
  it("keeps commas and escaped quotes inside quoted fields", () => {
    expect(parseCsv('title,description\r\n"Chef, Head","Says ""hello"""\r\n')).toEqual([
      ["title", "description"],
      ["Chef, Head", 'Says "hello"'],
    ]);
  });

  it("drops a BOM and blank lines", () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + "a,b\n\n1,2\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseImportRows", () => {
  it("maps each line onto the header row", () => {
    const rows = parseImportRows("users", "fullName,email\nSam Lee,sam@example.com\n");
    expect(rows).toEqual([{ rowNumber: 1, data: { fullName: "Sam Lee", email: "sam@example.com" }, issues: [] }]);
  });
});

describe("validateImportRow", () => {
  it("requires only the fields the import needs", () => {
    expect(validateImportRow("employers", { companyName: "Acme", email: "hr@acme.com" })).toEqual([]);
    expect(validateImportRow("users", { fullName: "", email: "x@y.co" })).toEqual([
      { code: "missing_fields", params: { fields: "fullName" } },
    ]);
  });

  it("rejects a malformed email", () => {
    expect(validateImportRow("users", { fullName: "Sam", email: "sam@" })).toContainEqual({ code: "invalid_email" });
  });

  it("only imports job seekers through the users import", () => {
    expect(validateImportRow("users", { fullName: "Sam", email: "s@x.co", role: "admin" })).toContainEqual({
      code: "role_not_allowed",
      params: { role: "admin" },
    });
    expect(validateImportRow("users", { fullName: "Sam", email: "s@x.co", role: "job_seeker" })).toEqual([]);
  });

  it("checks a job's type and salary", () => {
    const base = { title: "Chef", company: "Acme", city: "Dubai", country: "UAE", description: "Cook." };
    expect(validateImportRow("jobs", base)).toEqual([]);
    expect(validateImportRow("jobs", { ...base, type: "gig" })).toContainEqual({ code: "invalid_type", params: { value: "gig" } });
    expect(validateImportRow("jobs", { ...base, salaryMin: "abc" })).toContainEqual({ code: "invalid_salary" });
    expect(validateImportRow("jobs", { ...base, salaryMin: "9000", salaryMax: "5000" })).toContainEqual({ code: "invalid_salary" });
  });
});

describe("jobDraftFromRow", () => {
  it("builds the Job shape the schema requires", () => {
    expect(
      jobDraftFromRow({
        title: " Chef ", company: "Acme", city: "Dubai", country: "UAE", description: "Cook.",
        type: "Part Time", salaryMin: "5000", salaryMax: "7000", currency: "aed",
      }),
    ).toEqual({
      title: "Chef",
      description: "Cook.",
      location: { city: "Dubai", country: "UAE", isRemote: false },
      employmentType: "part_time",
      salary: { min: 5000, max: 7000, currency: "AED", period: "monthly" },
    });
  });

  it("defaults to full time and leaves salary out when none is given", () => {
    const draft = jobDraftFromRow({ title: "Chef", company: "Acme", city: "Dubai", country: "UAE", description: "Cook." });
    expect(draft.employmentType).toBe("full_time");
    expect(draft).not.toHaveProperty("salary");
  });
});
