import { normalizeParsedCv } from "@/lib/cv/parsedCv";

describe("normalizeParsedCv education years", () => {
  it("keeps the year a degree started, so onboarding does not ask it again", () => {
    const [edu] = normalizeParsedCv({
      education: [{ degree: "B.Com", institution: "St. Albert's College", from: "2016", to: "2019" }],
    }).education;
    expect(edu.startYear).toBe(2016);
    expect(edu.graduationDate?.getUTCFullYear()).toBe(2019);
  });

  it("reads the year out of a month date, and leaves junk out", () => {
    const parsed = normalizeParsedCv({
      education: [
        { degree: "MBA", institution: "A", from: "2020-06" },
        { degree: "BA", institution: "B", from: "soon" },
      ],
    });
    expect(parsed.education.map((e) => e.startYear)).toEqual([2020, undefined]);
  });
});
