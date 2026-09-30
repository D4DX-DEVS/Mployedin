/**
 * @jest-environment node
 *
 * Onboarding shows one job and one qualification. Saving them used to replace
 * the whole lists, so a CV's other jobs and degrees vanished (2026-09-30: four
 * jobs and two degrees went in, one of each was left).
 */
import { mergeExperienceEntry, mergeEducationEntry } from "@/lib/jobSeeker/wizardEntries";

const cvJobs = () => [
  { _id: "e1", jobTitle: "Manager, Client Acquisition", company: "IndiaMART", startDate: new Date("2025-03-01"), isCurrent: true, description: "Leads a team" },
  { _id: "e2", jobTitle: "Assistant Sales Manager", company: "Autumn Rooms", startDate: new Date("2024-07-01"), endDate: new Date("2025-02-01"), isCurrent: false },
  { _id: "e3", jobTitle: "Team Lead", company: "Autumn Rooms", startDate: new Date("2023-05-01"), endDate: new Date("2024-06-01"), isCurrent: false },
];

describe("mergeExperienceEntry", () => {
  it("updates the job the form showed and keeps every other job", () => {
    const { list, index } = mergeExperienceEntry(cvJobs(), {
      _id: "e1", jobTitle: "Sales Manager", company: "IndiaMART", startDate: new Date("2025-03-01"), isCurrent: true,
    });
    expect(index).toBe(0);
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ _id: "e1", jobTitle: "Sales Manager", description: "Leads a team" });
    expect(list.slice(1).map((e) => e._id)).toEqual(["e2", "e3"]);
  });

  it("finds the same job without an id when nothing changed, so a re-save adds no copy", () => {
    const { list, index } = mergeExperienceEntry(cvJobs(), {
      jobTitle: "team lead", company: "AUTUMN ROOMS", startDate: new Date("2023-05-01"), isCurrent: false,
    });
    expect(index).toBe(2);
    expect(list).toHaveLength(3);
    // The end date is not asked on the form, so the stored one stays.
    expect(list[2].endDate).toEqual(new Date("2024-06-01"));
  });

  it("puts a new job first and keeps the rest", () => {
    const { list, index } = mergeExperienceEntry(cvJobs(), { jobTitle: "Director", company: "Acme", isCurrent: true });
    expect(index).toBe(0);
    expect(list.map((e) => e.company)).toEqual(["Acme", "IndiaMART", "Autumn Rooms", "Autumn Rooms"]);
    expect(list[0]).not.toHaveProperty("_id");
  });

  it("ignores an id that is not in the stored list and never stores it", () => {
    const { list } = mergeExperienceEntry(cvJobs(), { _id: "zz", jobTitle: "Director", company: "Acme" });
    expect(list).toHaveLength(4);
    expect(list[0]).not.toHaveProperty("_id");
  });

  it("clears the end date when the seeker says the job is current", () => {
    const { list } = mergeExperienceEntry(cvJobs(), { _id: "e2", jobTitle: "Assistant Sales Manager", company: "Autumn Rooms", isCurrent: true });
    expect(list[1].isCurrent).toBe(true);
    expect(list[1].endDate).toBeUndefined();
  });

  it("tells Arabic jobs apart when matching without an id", () => {
    const stored = [
      { jobTitle: "محاسب", company: "شركة الأمل" },
      { jobTitle: "مهندس", company: "شركة النور" },
    ];
    const { list, index } = mergeExperienceEntry(stored, { jobTitle: "مدير", company: "شركة الفجر" });
    expect(index).toBe(0);
    expect(list.map((e) => e.company)).toEqual(["شركة الفجر", "شركة الأمل", "شركة النور"]);
  });

  it("still finds the same Arabic job on a re-save", () => {
    const stored = [{ jobTitle: "محاسب", company: "شركة الأمل" }, { jobTitle: "مهندس", company: "شركة النور" }];
    const { list, index } = mergeExperienceEntry(stored, { jobTitle: "مهندس", company: "شركة النور" });
    expect(index).toBe(1);
    expect(list).toHaveLength(2);
  });

  it("updates a legacy job that has no id when it is the same job", () => {
    const stored = [{ jobTitle: "Engineer", company: "Acme", endDate: new Date("2020-01-01") }];
    const { list, index } = mergeExperienceEntry(stored, { jobTitle: "Engineer", company: "Acme", isCurrent: false });
    expect(index).toBe(0);
    expect(list).toEqual([{ jobTitle: "Engineer", company: "Acme", endDate: new Date("2020-01-01"), isCurrent: false }]);
  });

  it("matches ObjectId-like ids by their string form", () => {
    const stored = [{ _id: { toString: () => "abc" }, jobTitle: "A", company: "B" }];
    const { list, index } = mergeExperienceEntry(stored, { _id: "abc", jobTitle: "A2", company: "B" });
    expect(index).toBe(0);
    expect(list).toHaveLength(1);
    expect(list[0].jobTitle).toBe("A2");
  });
});

describe("mergeEducationEntry", () => {
  const cvEducation = () => [
    { _id: "d1", degree: "MBA", field: "Finance & Marketing", institution: "AIM", grade: "A" },
    { _id: "d2", degree: "B.Com", field: "Marketing", institution: "Cochin College" },
  ];

  it("rewrites the qualification the form showed and keeps the other degrees", () => {
    const { list, index } = mergeEducationEntry(cvEducation(), {
      _id: "d1", degree: "Masters/Post-Graduation", course: "MBA", field: "Finance & Marketing", institution: "AIM", courseType: undefined, startYear: undefined, graduationDate: undefined,
    });
    expect(index).toBe(0);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ _id: "d1", degree: "Masters/Post-Graduation", course: "MBA", grade: "A" });
    expect(list[1]).toMatchObject({ _id: "d2", degree: "B.Com" });
  });

  it("takes the form's answers even when blank, e.g. a cleared specialisation", () => {
    const { list } = mergeEducationEntry(cvEducation(), { _id: "d1", degree: "Masters/Post-Graduation", course: "MBA", field: undefined, institution: "AIM" });
    expect(list[0].field).toBeUndefined();
  });

  it("adds a qualification without a match in front of the others", () => {
    const { list, index } = mergeEducationEntry(cvEducation(), { degree: "Doctorate/PhD", course: "PhD", institution: "IIT" });
    expect(index).toBe(0);
    expect(list.map((e) => e.degree)).toEqual(["Doctorate/PhD", "MBA", "B.Com"]);
  });

  it("keeps two Arabic institutions apart when matching without an id", () => {
    const stored = [
      { degree: "Masters/Post-Graduation", institution: "جامعة القاهرة" },
      { degree: "Masters/Post-Graduation", institution: "جامعة الأزهر" },
    ];
    const { list } = mergeEducationEntry(stored, { degree: "Masters/Post-Graduation", institution: "جامعة عين شمس" });
    expect(list).toHaveLength(3);
  });

  it("stores the single entry when there was nothing before", () => {
    const { list, index } = mergeEducationEntry([], { degree: "12th", institution: "" });
    expect(index).toBe(0);
    expect(list).toEqual([{ degree: "12th", institution: "" }]);
  });
});
