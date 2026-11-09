/**
 * @jest-environment node
 *
 * The AI keeps writing "Key Responsibilities: / Qualifications:" lists inside
 * the job description (2026-11-09: a poster's qualifications ended up in the
 * Description box instead of their own fields). These lists are moved into
 * their own fields in code, because the prompt alone does not hold.
 */
import { mergeUniqueItems, splitDescriptionSections, splitJobDescription } from "@/lib/jobs/descriptionSections";

const ADVERT = [
  "We are seeking a dedicated Operations Head to oversee and streamline business operations.",
  "",
  "Key Responsibilities:",
  "- Lead overall business operations to ensure efficiency and growth.",
  "- Travel as required to support operational needs.",
  "",
  "Qualifications:",
  "- Any degree",
  "- Valid driving licence",
  "",
  "Benefits:",
  "• Health insurance",
].join("\n");

describe("splitDescriptionSections", () => {
  it("moves labelled lists out of the description and keeps the overview", () => {
    const out = splitDescriptionSections(ADVERT);
    expect(out.overview).toBe(
      "We are seeking a dedicated Operations Head to oversee and streamline business operations.",
    );
    expect(out.responsibilities).toEqual([
      "Lead overall business operations to ensure efficiency and growth.",
      "Travel as required to support operational needs.",
    ]);
    expect(out.qualifications).toEqual(["Any degree", "Valid driving licence"]);
    expect(out.benefits).toEqual(["Health insurance"]);
    expect(out.skills).toEqual([]);
    expect(out.found).toBe(true);
  });

  it("reads markdown headings, numbered items and a heading with its item on the same line", () => {
    const out = splitDescriptionSections(
      "Run the warehouse floor for a busy site.\n\n**Requirements**\n1. 5+ years in logistics\n2) Forklift licence\n\nSkills: Excel, SAP; team leadership",
    );
    expect(out.overview).toBe("Run the warehouse floor for a busy site.");
    expect(out.qualifications).toEqual(["5+ years in logistics", "Forklift licence"]);
    expect(out.skills).toEqual(["Excel", "SAP", "team leadership"]);
  });

  it("reads Arabic headings", () => {
    const out = splitDescriptionSections("نبحث عن مدير عمليات لقيادة الفريق.\n\nالمؤهلات:\n- شهادة جامعية\n- رخصة قيادة");
    expect(out.overview).toBe("نبحث عن مدير عمليات لقيادة الفريق.");
    expect(out.qualifications).toEqual(["شهادة جامعية", "رخصة قيادة"]);
  });

  it("leaves a description with no labelled lists exactly as it is", () => {
    const text = "You will lead a team of six.\n\nThe role suits someone who enjoys travel.";
    const out = splitDescriptionSections(text);
    expect(out.found).toBe(false);
    expect(out.overview).toBe(text);
  });

  it("does not treat a sentence that merely mentions responsibilities as a heading", () => {
    const text = "Responsibilities include running the floor: picking, packing and dispatch.";
    expect(splitDescriptionSections(text).found).toBe(false);
  });

  it("ends a list at a blank line followed by ordinary prose", () => {
    const out = splitDescriptionSections("Intro line for the role here.\n\nDuties:\n- Pack orders\n\nWe value people who learn fast.");
    expect(out.responsibilities).toEqual(["Pack orders"]);
    expect(out.overview).toBe("Intro line for the role here.\n\nWe value people who learn fast.");
  });
});

// Review 2026-11-09: inputs that used to delete or reorder prose, or split one skill in two.
describe("splitDescriptionSections: prose and items it must not break", () => {
  it.each([
    "We want a candidate with strong\nexperience\nin B2B sales and a track record of success.",
    "Our academy values\nEducation\nabove all else, and supports every learner.",
    "Requirements\nare reviewed monthly by the hiring panel.",
  ])("leaves a heading word inside prose alone: %s", (text) => {
    const out = splitDescriptionSections(text);
    expect(out.found).toBe(false);
    expect(out.overview).toBe(text);
  });

  it("keeps a bulleted skill whole, and splits an inline list only outside brackets", () => {
    const out = splitDescriptionSections(
      "Overview of the office role here.\n\nSkills:\n- Microsoft Office (Word, Excel, PowerPoint)\n- Strong communication, negotiation and presentation skills",
    );
    expect(out.skills).toEqual(["Microsoft Office (Word, Excel, PowerPoint)", "Strong communication, negotiation and presentation skills"]);
    expect(splitDescriptionSections("Skills: Microsoft Office (Word, Excel), SAP").skills).toEqual(["Microsoft Office (Word, Excel)", "SAP"]);
  });

  it("files a 'skill' too long for the skills field as a qualification", () => {
    const long = "Ability to work under pressure in a fast-moving events business while keeping every stakeholder informed";
    const out = splitDescriptionSections(`Overview of the role here.\n\nSkills:\n- ${long}\n- Excel`);
    expect(out.skills).toEqual(["Excel"]);
    expect(out.qualifications).toEqual([long]);
  });

  it("keeps the label of an inline experience or education line", () => {
    const out = splitDescriptionSections("Overview of the shop role here.\n\nExperience: 3-5 years in retail\nEducation: Diploma");
    expect(out.qualifications).toEqual(["Experience: 3-5 years in retail", "Education: Diploma"]);
  });

  it("ends an unbulleted list at another labelled line", () => {
    const out = splitDescriptionSections("Responsibilities:\nDrive trucks\nLocation: Dubai\nSalary: 2000 AED");
    expect(out.responsibilities).toEqual(["Drive trucks"]);
    expect(out.overview).toBe("Location: Dubai\nSalary: 2000 AED");
  });

  it("reads Arabic-Indic numbering and Windows line endings", () => {
    const out = splitDescriptionSections("وصف مختصر للوظيفة هنا.\r\n\r\nالمؤهلات:\r\n١. بكالوريوس هندسة\r\n٢. رخصة قيادة");
    expect(out.qualifications).toEqual(["بكالوريوس هندسة", "رخصة قيادة"]);
  });

  it("leaves a heading with nothing under it in the description", () => {
    const out = splitDescriptionSections("Benefits:\n\nWe will discuss the package at interview.");
    expect(out.found).toBe(false);
  });
});

describe("mergeUniqueItems", () => {
  it("adds only new items, ignoring case and spacing, up to the cap", () => {
    expect(mergeUniqueItems(["Any degree"], ["any  degree", "Driving licence"], 20)).toEqual(["Any degree", "Driving licence"]);
    expect(mergeUniqueItems(["a"], ["b", "c"], 2)).toEqual(["a", "b"]);
  });
});

interface DraftJob {
  title?: string;
  description?: string;
  responsibilities?: string[];
  qualifications?: string[];
  benefits?: string[];
  requirements?: { skills?: string[] };
}

describe("splitJobDescription", () => {
  it("moves the lists into an extracted job's own fields, merged with what it already has", () => {
    const job = splitJobDescription<DraftJob>({
      title: "Operations Head",
      description: ADVERT,
      responsibilities: ["Lead overall business operations to ensure efficiency and growth."],
      requirements: { skills: ["Leadership"] },
    });
    expect(job.description).toBe(
      "We are seeking a dedicated Operations Head to oversee and streamline business operations.",
    );
    expect(job.responsibilities).toEqual([
      "Lead overall business operations to ensure efficiency and growth.",
      "Travel as required to support operational needs.",
    ]);
    expect(job.qualifications).toEqual(["Any degree", "Valid driving licence"]);
    expect(job.benefits).toEqual(["Health insurance"]);
    expect(job.requirements).toEqual({ skills: ["Leadership"] });
  });

  it("keeps a description that is nothing but lists, so a draft still has one", () => {
    const job = splitJobDescription<DraftJob>({ description: "Qualifications:\n- Any degree" });
    expect(job.description).toBe("Qualifications:\n- Any degree");
    expect(job.qualifications).toEqual(["Any degree"]);
  });

  it("moves nothing when the items would not all fit (more than 20), so no text is lost", () => {
    const items = Array.from({ length: 25 }, (_, i) => `- Duty number ${i + 1}`).join("\n");
    const job = { description: `Overview of the busy role here.\n\nResponsibilities:\n${items}` };
    expect(splitJobDescription(job)).toBe(job);
  });

  it("returns the job untouched when there is nothing to move", () => {
    const job = { title: "Nurse", description: "Care for patients on a busy ward." };
    expect(splitJobDescription(job)).toBe(job);
  });
});
