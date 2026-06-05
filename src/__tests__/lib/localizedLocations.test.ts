import {
  formatLocalizedLocation,
  getLocalizedCountryName,
  getRegionCodeForCountryName,
} from "@/lib/i18n/locations";

describe("localized location helpers", () => {
  it("maps common GCC country names to region codes", () => {
    expect(getRegionCodeForCountryName("Saudi Arabia")).toBe("SA");
    expect(getRegionCodeForCountryName("UAE")).toBe("AE");
    expect(getRegionCodeForCountryName("Oman")).toBe("OM");
  });

  it("localizes known countries for Arabic without changing free-form cities", () => {
    expect(getLocalizedCountryName("Bahrain", "ar")).toBe("البحرين");
    expect(getLocalizedCountryName("Chennai", "ar")).toBe("Chennai");
  });

  it("handles blank values and Remote/Global variants", () => {
    expect(getLocalizedCountryName(null, "ar")).toBe("");
    expect(getLocalizedCountryName(undefined, "en")).toBe("");
    expect(getLocalizedCountryName("Remote/Global", "ar", { remoteGlobalLabel: "عن بُعد / عالمي" })).toBe("عن بُعد / عالمي");
  });

  it("formats job locations with localized country names", () => {
    expect(
      formatLocalizedLocation(
        { city: "Riyadh", country: "Saudi Arabia", isRemote: false },
        "ar",
        { remoteLabel: "عن بُعد", fallback: "الموقع مرن" }
      )
    ).toBe("Riyadh, المملكة العربية السعودية");
  });

  it("deduplicates city and country when both carry the same country value", () => {
    expect(
      formatLocalizedLocation(
        { city: "Kuwait", country: "Kuwait", isRemote: false },
        "ar",
        { remoteLabel: "عن بُعد" }
      )
    ).toBe("الكويت");
  });
});