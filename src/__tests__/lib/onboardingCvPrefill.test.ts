/**
 * @jest-environment node
 *
 * What onboarding fills in from a CV. Each case is taken from a real import
 * (2026-09-30): the AI read the CV correctly and the form then showed the wrong
 * phone code, the current job's length as total experience, and no area.
 */
import {
  areaFromCv,
  cityNameCandidates,
  findCatalogueCity,
  pickCurrentExperience,
  pickHighestEducation,
  splitCvPhone,
  totalExperience,
} from "@/lib/onboarding/cvPrefill";

describe("splitCvPhone", () => {
  it("separates the country code a CV writes with a plus", () => {
    expect(splitCvPhone("+91 97460 60086")).toEqual({ dialCode: "+91", phone: "9746060086", country: "IN" });
  });

  it("reads a 00 international prefix as a plus", () => {
    expect(splitCvPhone("00971 50 123 4567")).toEqual({ dialCode: "+971", phone: "501234567", country: "AE" });
  });

  it("takes the longest code, so +971 is not read as +9", () => {
    expect(splitCvPhone("+971501234567")).toEqual({ dialCode: "+971", phone: "501234567", country: "AE" });
  });

  it("drops the trunk 0 a CV writes in brackets", () => {
    expect(splitCvPhone("+971 (0) 50 123 4567")).toMatchObject({ dialCode: "+971", phone: "501234567" });
  });

  it("reads a number without its plus, or with none at all, in the country the CV says the seeker lives", () => {
    expect(splitCvPhone("971 50 123 4567", "AE")).toMatchObject({ dialCode: "+971", phone: "501234567" });
    expect(splitCvPhone("97460 60086", "IN")).toMatchObject({ dialCode: "+91", phone: "9746060086" });
  });

  it("takes the first of several numbers", () => {
    expect(splitCvPhone("+971 50 123 4567 / +91 97460 60086")).toMatchObject({ dialCode: "+971", phone: "501234567" });
    // Read live from a CV on 2026-09-30: two Bahrain numbers joined by a dash.
    expect(splitCvPhone("66337079 - 33838683", "BH")).toEqual({ dialCode: "+973", phone: "66337079", country: "BH" });
  });

  it("keeps the dashes inside one number as part of it", () => {
    expect(splitCvPhone("Tel: 050-123-4567", "AE")).toMatchObject({ dialCode: "+971", phone: "501234567" });
  });

  it("tells countries that share a code apart", () => {
    expect(splitCvPhone("+7 912 345 6789")).toMatchObject({ dialCode: "+7", country: "RU" });
    expect(splitCvPhone("+1 416 555 0123")).toMatchObject({ dialCode: "+1", country: "CA" });
  });

  it("never returns more digits than a phone number can have", () => {
    expect(splitCvPhone("+999 1234 5678 9012 3456 7890")!.phone.length).toBeLessThanOrEqual(15);
  });

  it("keeps a number with no country code as the national digits", () => {
    expect(splitCvPhone("050-123 4567")).toEqual({ phone: "0501234567" });
  });

  it("returns nothing for an empty value", () => {
    expect(splitCvPhone("")).toBeNull();
    expect(splitCvPhone(undefined)).toBeNull();
  });
});

describe("totalExperience", () => {
  const now = new Date("2026-09-30T00:00:00Z");
  const jobs = [
    { startDate: "2025-03-01", isCurrent: true },
    { startDate: "2024-07-01", endDate: "2025-02-01" },
    { startDate: "2023-05-01", endDate: "2024-06-01" },
    { jobTitle: "undated" },
  ];

  it("uses the total the CV states over the dated jobs", () => {
    expect(totalExperience(6, jobs, now)).toEqual({ years: 6, months: 0 });
  });

  it("turns a fractional stated total into years and months", () => {
    expect(totalExperience(2.5, [], now)).toEqual({ years: 2, months: 6 });
  });

  it("adds up every dated job when the CV states no total, not just the current one", () => {
    // May 2023 – June 2024 (14) + July 2024 – Feb 2025 (8) + Mar 2025 – now (18) = 40 months
    expect(totalExperience(0, jobs, now)).toEqual({ years: 3, months: 4 });
  });

  it("counts overlapping jobs once", () => {
    const overlapping = [
      { startDate: "2020-01-01", endDate: "2021-12-01" },
      { startDate: "2021-01-01", endDate: "2022-12-01" },
    ];
    expect(totalExperience(undefined, overlapping, now)).toEqual({ years: 3, months: 0 });
  });

  it("counts a job's last month, so back-to-back years add up to whole years", () => {
    const years = [
      { startDate: "2020-01", endDate: "2020-12" },
      { startDate: "2021-01", endDate: "2021-12" },
    ];
    expect(totalExperience(0, years, now)).toEqual({ years: 2, months: 0 });
  });

  it("reads a month named in words as that month, whatever the time zone", () => {
    expect(totalExperience(0, [{ startDate: "Jan 2019", endDate: "Dec 2019" }], now)).toEqual({ years: 1, months: 0 });
  });

  it("ignores a stated total no career reaches", () => {
    expect(totalExperience(85, [{ startDate: "2020-01", endDate: "2020-12" }], now)).toEqual({ years: 1, months: 0 });
  });

  it("caps at the 30 years the form offers", () => {
    expect(totalExperience(45, [], now)).toEqual({ years: 30, months: 0 });
  });

  it("returns null when nothing is known", () => {
    const undated = [{ jobTitle: "undated", startDate: null }];
    expect(totalExperience(0, undated, now)).toBeNull();
  });
});

describe("pickCurrentExperience", () => {
  it("prefers the job marked current, wherever the CV lists it", () => {
    const list = [
      { company: "Old", startDate: "2015-01-01", endDate: "2018-01-01" },
      { company: "Now", startDate: "2020-01-01", isCurrent: true },
    ];
    expect(pickCurrentExperience(list)?.company).toBe("Now");
  });

  it("falls back to the most recent start", () => {
    const list = [
      { company: "Older", startDate: "2015-01-01" },
      { company: "Newer", startDate: "2019-06-01" },
    ];
    expect(pickCurrentExperience(list)?.company).toBe("Newer");
  });

  it("falls back to the first job when nothing is dated", () => {
    const undated = [{ company: "A", startDate: null }, { company: "B", startDate: null }];
    expect(pickCurrentExperience(undated)?.company).toBe("A");
    expect(pickCurrentExperience([])).toBeUndefined();
  });
});

describe("pickHighestEducation", () => {
  const level = (e: { degree: string }) =>
    ({ "B.Com": "graduation", MBA: "masters", PhD: "doctorate", "12th": "12th" })[e.degree] ?? "";

  it("picks the highest qualification, not the first listed", () => {
    expect(pickHighestEducation([{ degree: "B.Com" }, { degree: "MBA" }], level)?.degree).toBe("MBA");
    expect(pickHighestEducation([{ degree: "12th" }, { degree: "PhD" }, { degree: "MBA" }], level)?.degree).toBe("PhD");
  });

  it("keeps the first entry when no level is recognised", () => {
    expect(pickHighestEducation([{ degree: "Diploma X" }, { degree: "Course Y" }], level)?.degree).toBe("Diploma X");
  });
});

describe("areaFromCv", () => {
  it("takes the country from the location line when it names one", () => {
    expect(areaFromCv({ location: "Kochi, Kerala, India" })).toEqual({ countryCode: "IN", cityName: "Kochi" });
  });

  it("falls back to the phone's country when the location names none", () => {
    expect(areaFromCv({ location: "Kochi, Kerala", dialCode: "+91" })).toEqual({ countryCode: "IN", cityName: "Kochi" });
  });

  it("has no city when the location is only a country", () => {
    expect(areaFromCv({ location: "United Arab Emirates" })).toEqual({ countryCode: "AE", cityName: "" });
  });

  it("prefers the phone country over a two-letter state that looks like a country", () => {
    // "MA" is Massachusetts here, not Morocco.
    expect(areaFromCv({ location: "Boston, MA", phoneCountry: "US" })).toEqual({ countryCode: "US", cityName: "Boston" });
  });

  it("returns null when neither says where the seeker lives", () => {
    expect(areaFromCv({ location: "" })).toBeNull();
  });
});

describe("findCatalogueCity", () => {
  const reply = (results: Array<{ _id: string; name: string }>) =>
    Promise.resolve({ ok: true, json: async () => ({ results }) } as Response);

  it("knows a city's other name, e.g. Kochi is listed as Cochin", () => {
    expect(cityNameCandidates("Kochi")).toContain("Cochin");
    expect(cityNameCandidates("Bangalore")).toContain("Bengaluru");
  });

  it("returns the catalogue city whose name matches exactly", async () => {
    const fetchFn = jest.fn((url: string) =>
      url.includes("search=Cochin")
        ? reply([{ _id: "c1", name: "Cochin" }, { _id: "c2", name: "Cochin Port" }])
        : reply([]),
    );
    await expect(findCatalogueCity("IN", "Kochi", fetchFn)).resolves.toEqual({ id: "c1", name: "Cochin" });
    expect(fetchFn.mock.calls[0][0]).toContain("country=IN");
  });

  it("leaves the city to the seeker when nothing matches exactly", async () => {
    const fetchFn = jest.fn(() => reply([{ _id: "c9", name: "Kochi Port" }]));
    await expect(findCatalogueCity("IN", "Kochi", fetchFn)).resolves.toBeNull();
  });

  it("gives up on a search that hangs, so the import is not held up", async () => {
    const hang = jest.fn((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(findCatalogueCity("IN", "Kochi", hang, 20)).resolves.toBeNull();
  });

  it("never throws when the search fails", async () => {
    const fetchFn = jest.fn(() => Promise.reject(new Error("offline")));
    await expect(findCatalogueCity("IN", "Kochi", fetchFn)).resolves.toBeNull();
  });
});
