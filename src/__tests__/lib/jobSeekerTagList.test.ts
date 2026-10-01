/**
 * @jest-environment node
 *
 * Found while chasing "CV: Add to Profile says We couldn't save" (2026-10-01):
 * 13 of 256 stored profiles hold a whole skill list joined into one entry by
 * the bulk import ("Document Management | MS Office | MS Excel | …"). Over the
 * validator's 100 characters, it failed every save that sends skills back —
 * the CV builder and the Skills page.
 */
import { jobSeekerProfileUpdateSchema } from "@/lib/validators/job-seekers";
import { cleanSkills, MAX_SKILL_LENGTH } from "@/lib/jobSeeker/tagList";

describe("cleanSkills", () => {
  it("splits an imported '|'-joined list back into skills", () => {
    const joined = "Relationship Management | Strategic Planning | Recruitment | Payroll Processing | Employee Lifecycle Management | SAP | MS Office";
    expect(cleanSkills([joined])).toEqual([
      "Relationship Management", "Strategic Planning", "Recruitment", "Payroll Processing",
      "Employee Lifecycle Management", "SAP", "MS Office",
    ]);
  });

  it("splits ';'-joined and comma-joined lists the same way", () => {
    const semi = "Team Leadership; GRN Processing; Stock Management; Cash Handling; PIS; Sales Reporting; Loss Control; Computer Basics";
    const comma = "Python, JavaScript, TypeScript, React, Node.js, Express, MongoDB, PostgreSQL, Docker, Kubernetes, AWS";
    expect(cleanSkills([semi])).toHaveLength(8);
    expect(cleanSkills([comma])).toEqual([
      "Python", "JavaScript", "TypeScript", "React", "Node.js", "Express", "MongoDB",
      "PostgreSQL", "Docker", "Kubernetes", "AWS",
    ]);
  });

  it("leaves ordinary skills alone, even ones with separators in them", () => {
    expect(cleanSkills(["C/C++ | Java", "Sales, Marketing", "React.js"])).toEqual(["C/C++ | Java", "Sales, Marketing", "React.js"]);
  });

  it("drops repeats and blanks, clips anything still too long, and keeps at most 50", () => {
    const many = Array.from({ length: 60 }, (_, i) => `Skill ${i}`);
    expect(cleanSkills(["React", "react", "  ", 7, ...many])).toHaveLength(50);
    expect(cleanSkills(["x".repeat(150)])[0]).toHaveLength(MAX_SKILL_LENGTH);
    expect(cleanSkills(undefined)).toEqual([]);
  });

  it("gives a list the profile save accepts", () => {
    const stored = [
      "Evaporator/Condenser/Compressor operation & maintenance; Ammonia Refrigeration; Gas Charging; Blast/Chiller/Cold Store; Killosker Compressor; KC72/42/04/02/06/9",
      "Flutter Development | .NET Full Stack Development | Mobile App Development | UI/UX Design | HTML | CSS | Web Development | API Integration",
    ];
    expect(jobSeekerProfileUpdateSchema.safeParse({ skills: cleanSkills(stored) }).success).toBe(true);
  });
});
