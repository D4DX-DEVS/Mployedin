import { gmtOffset } from "@/lib/i18n/useTimezoneOptions";

jest.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));

// CI (newer ICU) printed "GMT+0" for London in winter while local ICU 77
// printed "GMT"; the picker label must not depend on the runtime's ICU.
describe("gmtOffset", () => {
  it("labels a zero offset as plain GMT", () => {
    expect(gmtOffset("Europe/London", new Date("2026-11-05T12:00:00Z"))).toBe("GMT");
    expect(gmtOffset("UTC", new Date("2026-11-05T12:00:00Z"))).toBe("GMT");
  });

  it("keeps non-zero offsets as ICU prints them", () => {
    expect(gmtOffset("Europe/London", new Date("2026-07-05T12:00:00Z"))).toBe("GMT+1");
    expect(gmtOffset("Asia/Dubai", new Date("2026-11-05T12:00:00Z"))).toBe("GMT+4");
    expect(gmtOffset("Asia/Kolkata", new Date("2026-11-05T12:00:00Z"))).toBe("GMT+5:30");
  });

  it("returns an empty label for an unknown zone", () => {
    expect(gmtOffset("Not/AZone")).toBe("");
  });
});
