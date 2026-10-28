/**
 * Whether two job titles describe the same kind of work.
 *
 * The regression this pins (client, 2026-10-28): "Suitable profiles" for a
 * Senior Backend Engineer scored a Quality Control Engineer's role 90% because
 * both titles contain "engineer", and listed a journalist and a sales executive
 * among the best matches.
 */
import { sharesRole } from "@/lib/matching/roleMatch";

describe("sharesRole", () => {
  it("does not treat a shared generic word like 'engineer' as the same role", () => {
    expect(sharesRole("Senior Backend Engineer", ["Quality Control Engineer"])).toBe(false);
    expect(sharesRole("Senior Backend Engineer", ["Software Engineer"])).toBe(false);
    expect(sharesRole("HR Manager", ["Sales Manager"])).toBe(false);
    expect(sharesRole("Flutter Developer", ["Backend Developer"])).toBe(false);
  });

  it("matches on the word that says what the work is", () => {
    expect(sharesRole("Senior Backend Engineer", ["Backend Developer"])).toBe(true);
    expect(sharesRole("Full Stack Developer", ["Senior Full Stack Developer"])).toBe(true);
    expect(sharesRole("CCTV Technician", ["CCTV Installer"])).toBe(true);
    expect(sharesRole("Accountant", ["Junior Accountant – IMUTSA"])).toBe(true);
  });

  it("counts short acronyms such as QA, IT and HR", () => {
    expect(sharesRole("QA Test Engineer", ["QA Engineer"])).toBe(true);
    expect(sharesRole("HR Manager", ["HR Executive"])).toBe(true);
  });

  it("falls back to the generic word when the job title has nothing more specific", () => {
    expect(sharesRole("Senior Developer", ["MERN Stack Developer"])).toBe(true);
    expect(sharesRole("Engineer", ["Civil Engineer"])).toBe(true);
  });

  it("finds no relation for unrelated work or missing titles", () => {
    expect(sharesRole("Senior Backend Engineer", ["Journalist", "Sales Executive (Metro Lube L.L.C.)"])).toBe(false);
    expect(sharesRole("CCTV Technician", ["Accountant"])).toBe(false);
    expect(sharesRole("", ["Backend Developer"])).toBe(false);
    expect(sharesRole("Backend Developer", [])).toBe(false);
  });
});
