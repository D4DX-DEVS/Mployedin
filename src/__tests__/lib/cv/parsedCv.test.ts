/**
 * The CV reading's shape, and how the ATS folds it into the profile without
 * dropping or overwriting anything the seeker typed.
 */
import {
  applicantCvOf,
  cvTextFromParsed,
  hasParsedContent,
  mergeCvIntoSeeker,
  normalizeParsedCv,
  resumeUrlOf,
  type ApplicantCv,
} from "@/lib/cv/parsedCv";

const MODEL_OUTPUT = {
  fullName: "Antony P",
  headline: "Sales leader, FMCG and distribution",
  currentLocation: "Cherthala, Kerala, India",
  skills: [{ name: "Channel Sales" }, "Distribution Management", { name: "channel sales" }, { name: "" }],
  experience: [
    { jobTitle: "AGM Sales", company: "Sowparnika", location: "India", from: "2023-02", to: "present", current: true, description: "Led sales" },
    { jobTitle: "Regional Manager", company: "VETA", from: "2014-12", to: "2015-11", current: false },
    { jobTitle: "", company: "" },
  ],
  education: [{ degree: "MBA", field: "Marketing", institution: "Kerala University", to: "2008" }, {}],
  languages: [{ language: "English", level: "fluent" }, { language: "Malayalam", level: "native" }, { language: "Hindi", level: "odd" }],
  certifications: ["Six Sigma", ""],
  totalExperienceYears: 16,
};

describe("normalizeParsedCv", () => {
  it("maps the model's output to the profile's shape", () => {
    const cv = normalizeParsedCv(MODEL_OUTPUT);
    // Deduplicated case-insensitively, blanks dropped.
    expect(cv.skills).toEqual(["Channel Sales", "Distribution Management"]);
    expect(cv.experience).toHaveLength(2);
    expect(cv.experience[0]).toMatchObject({ jobTitle: "AGM Sales", company: "Sowparnika", country: "India", isCurrent: true });
    expect(cv.experience[0].startDate?.getUTCFullYear()).toBe(2023);
    expect(cv.experience[0].endDate).toBeUndefined();
    expect(cv.experience[1].endDate?.getUTCMonth()).toBe(10);
    expect(cv.education).toEqual([
      expect.objectContaining({ degree: "MBA", field: "Marketing", institution: "Kerala University" }),
    ]);
    expect(cv.languages).toEqual([
      { language: "English", proficiency: "professional" },
      { language: "Malayalam", proficiency: "native" },
      { language: "Hindi", proficiency: "basic" },
    ]);
    expect(cv.certifications).toEqual(["Six Sigma"]);
    expect(cv.totalExperienceYears).toBe(16);
  });

  it("keeps only a plausible stated total", () => {
    expect(normalizeParsedCv({ totalExperienceYears: "6" }).totalExperienceYears).toBe(6);
    expect(normalizeParsedCv({ totalExperienceYears: 0 }).totalExperienceYears).toBe(0);
    expect(normalizeParsedCv({ totalExperienceYears: 400 }).totalExperienceYears).toBe(0);
    expect(normalizeParsedCv({ totalExperienceYears: "many" }).totalExperienceYears).toBe(0);
    expect(normalizeParsedCv({}).totalExperienceYears).toBe(0);
  });

  it("accepts a stored reading (profile field names, JSON dates) and never throws on junk", () => {
    const stored = JSON.parse(JSON.stringify(normalizeParsedCv(MODEL_OUTPUT)));
    const again = normalizeParsedCv(stored);
    expect(again.experience[0].startDate?.getUTCFullYear()).toBe(2023);
    expect(again.experience[0].isCurrent).toBe(true);
    expect(again.languages[0].proficiency).toBe("professional");
    expect(normalizeParsedCv(null).skills).toEqual([]);
    expect(normalizeParsedCv("nonsense").experience).toEqual([]);
  });
});

describe("cvTextFromParsed", () => {
  it("writes a scan's reading out as searchable text", () => {
    const text = cvTextFromParsed(normalizeParsedCv(MODEL_OUTPUT));
    expect(text).toContain("Skills: Channel Sales, Distribution Management");
    expect(text).toContain("AGM Sales at Sowparnika");
    expect(text).toContain("2023–present");
    expect(text).toContain("MBA, Marketing, Kerala University");
  });

  it("counts a reading with no skills, jobs or education as empty", () => {
    expect(hasParsedContent(normalizeParsedCv({ headline: "hello" }))).toBe(false);
    expect(hasParsedContent(normalizeParsedCv(MODEL_OUTPUT))).toBe(true);
  });
});

describe("applicantCvOf", () => {
  it("maps a record's status to what the checklist says", () => {
    expect(applicantCvOf(null)).toEqual({ state: "none" });
    expect(applicantCvOf({ status: "uploaded", fileName: "a.pdf" })).toEqual({ state: "reading", fileName: "a.pdf" });
    expect(applicantCvOf({ status: "processing" }).state).toBe("reading");
    expect(applicantCvOf({ status: "failed" }).state).toBe("unreadable");
    const read = applicantCvOf({ status: "processed", text: "cv text", parsed: MODEL_OUTPUT });
    expect(read.state).toBe("read");
    expect(read.text).toBe("cv text");
    expect(read.parsed?.skills).toContain("Channel Sales");
  });
});

describe("resumeUrlOf", () => {
  it("is the application's first resume attachment", () => {
    expect(resumeUrlOf([{ type: "portfolio", url: "p" }, { type: "resume", url: "r1" }, { type: "resume", url: "r2" }])).toBe("r1");
    expect(resumeUrlOf([{ type: "other", url: "x" }])).toBeNull();
    expect(resumeUrlOf(undefined)).toBeNull();
  });
});

describe("mergeCvIntoSeeker", () => {
  const read = (parsed: unknown, text = "full cv text"): ApplicantCv => ({ state: "read", text, parsed: normalizeParsedCv(parsed) });

  it("adds the CV's skills, education and languages to the profile's", () => {
    const seeker = {
      skills: ["CRM", "channel sales"],
      education: [{ degree: "MBA", field: "Marketing" }],
      languages: [{ language: "english" }],
      cv: { rawText: "old text", originalUrl: "u" },
    };
    const merged = mergeCvIntoSeeker(seeker, read(MODEL_OUTPUT));
    expect(merged.skills).toEqual(["CRM", "channel sales", "Distribution Management"]);
    expect(merged.education).toHaveLength(1);
    expect((merged.languages as Array<{ language: string }>).map((l) => l.language)).toEqual(["english", "Malayalam", "Hindi"]);
    // The CV that was sent is the text evidence.
    expect(merged.cv).toEqual({ rawText: "full cv text", originalUrl: "u" });
    // The input is not mutated.
    expect(seeker.skills).toEqual(["CRM", "channel sales"]);
  });

  it("keeps the job history with more dated roles, never both", () => {
    const typed = [{ jobTitle: "Sales", startDate: "2020-01-01" }];
    expect(mergeCvIntoSeeker({ experience: typed }, read(MODEL_OUTPUT)).experience).toHaveLength(2);
    const longer = [
      { jobTitle: "A", startDate: "2010-01-01" },
      { jobTitle: "B", startDate: "2012-01-01" },
      { jobTitle: "C", startDate: "2016-01-01" },
    ];
    expect(mergeCvIntoSeeker({ experience: longer }, read(MODEL_OUTPUT)).experience).toBe(longer);
  });

  it("fills the location and the stated total only when the profile has none", () => {
    expect(mergeCvIntoSeeker({ currentLocation: "Kochi" }, read(MODEL_OUTPUT)).currentLocation).toBe("Kochi");
    expect(mergeCvIntoSeeker({ currentLocation: "" }, read(MODEL_OUTPUT)).currentLocation).toBe("Cherthala, Kerala, India");
    expect(mergeCvIntoSeeker({ totalExperienceYears: 0 }, read(MODEL_OUTPUT)).totalExperienceYears).toBe(16);
    expect(mergeCvIntoSeeker({ totalExperienceYears: 9 }, read(MODEL_OUTPUT)).totalExperienceYears).toBe(9);
  });

  it("changes nothing for a CV that has not been read", () => {
    const seeker = { skills: ["CRM"] };
    expect(mergeCvIntoSeeker(seeker, { state: "reading" })).toBe(seeker);
    expect(mergeCvIntoSeeker(seeker, { state: "unreadable" })).toBe(seeker);
    expect(mergeCvIntoSeeker(seeker, null)).toBe(seeker);
  });

  it("uses the text alone when only the text could be kept", () => {
    const merged = mergeCvIntoSeeker({ skills: ["CRM"] } as { skills: string[]; cv?: unknown }, { state: "read", text: "cv words", parsed: null });
    expect(merged.skills).toEqual(["CRM"]);
    expect(merged.cv).toEqual({ rawText: "cv words" });
  });
});
