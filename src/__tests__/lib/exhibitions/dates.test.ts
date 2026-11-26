import { validateExhibitionDates } from "@/lib/exhibitions/dates";

const now = new Date("2026-11-26T12:00:00Z");

describe("validateExhibitionDates (AG-05)", () => {
  it("accepts ordered dates and missing dates", () => {
    expect(validateExhibitionDates("2026-12-01", "2026-12-03", { isCreate: true, now })).toBeNull();
    expect(validateExhibitionDates("2026-12-01", "2026-12-01", { isCreate: true, now })).toBeNull();
    expect(validateExhibitionDates(undefined, undefined, { isCreate: true, now })).toBeNull();
  });
  it("rejects an end before the start", () => {
    expect(validateExhibitionDates("2026-12-05", "2026-12-01")).toMatch(/before the start/);
  });
  it("rejects unparseable dates", () => {
    expect(validateExhibitionDates("garbage", undefined)).toMatch(/start date/);
    expect(validateExhibitionDates(undefined, "nope")).toMatch(/end date/);
  });
  it("rejects a years-old start on create only", () => {
    expect(validateExhibitionDates("2020-01-01", "2020-01-02", { isCreate: true, now })).toMatch(/year/);
    expect(validateExhibitionDates("2020-01-01", "2020-01-02", { now })).toBeNull();
  });
});
