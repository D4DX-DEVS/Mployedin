// Client check 2026-10-30: Browse jobs offered "Chennai", "IN", "Kerala" and
// "India" as four countries.
import { countryChoices, countryCodeOf, countryLabel, countrySpellings } from "@/lib/jobs/countryFacets";

describe("countryChoices", () => {
  it("offers one English name per country and drops values that are not countries", () => {
    expect(countryChoices(["IN", "India", "india ", "Chennai", "Kerala", "UAE", "United Arab Emirates", "Oman (Muscat)", "", null, "EU"]))
      .toEqual(["India", "Oman", "United Arab Emirates"]);
  });
});

describe("countryCodeOf", () => {
  it("reads codes, names and aliases", () => {
    expect(countryCodeOf("in")).toBe("IN");
    expect(countryCodeOf("Saudi Arabia")).toBe("SA");
    expect(countryCodeOf("KSA")).toBe("SA");
    expect(countryCodeOf("Canada")).toBe("CA");
    expect(countryCodeOf("Chennai")).toBeNull();
    expect(countryCodeOf("ZZ")).toBeNull();
  });
});

describe("countrySpellings", () => {
  const matches = (choice: string, stored: string) => countrySpellings(choice).some((re) => re.test(stored));

  it("matches every spelling of the chosen country", () => {
    for (const stored of ["India", "IN", " india", "India (Kerala)"]) expect(matches("India", stored)).toBe(true);
    for (const stored of ["UAE", "AE", "United Arab Emirates", "u.a.e"]) expect(matches("United Arab Emirates", stored)).toBe(true);
    expect(matches("Canada", "CA")).toBe(true);
  });

  it("does not match a different country", () => {
    expect(matches("India", "Indonesia")).toBe(false);
    expect(matches("Oman", "Romania")).toBe(false);
  });
});

describe("countryLabel", () => {
  it("names the country in the reader's language", () => {
    expect(countryLabel("India", "en")).toBe("India");
    expect(countryLabel("India", "ar")).not.toBe("India");
    expect(countryLabel("Remote / Global", "ar")).toBe("Remote / Global");
  });
});
