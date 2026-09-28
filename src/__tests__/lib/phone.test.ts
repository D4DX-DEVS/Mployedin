import { isInternationalPhone, normalizePhoneValue } from "@/lib/phone/validation";
import { FALLBACK_PHONE_COUNTRIES, normalizeDialCode } from "@/lib/phone/countries";

describe("phone helpers", () => {
  it("normalizes international values without changing their meaning", () => {
    expect(normalizePhoneValue("+971 50 123 4567")).toBe("+971501234567");
    expect(normalizeDialCode("971")).toBe("+971");
  });

  it("validates numbers against the selected country's numbering plan", () => {
    expect(isInternationalPhone("+971 50 123 4567")).toBe(true);
    expect(isInternationalPhone("+966 50 123 4567")).toBe(true);
    expect(isInternationalPhone("+973 12345678")).toBe(true);
    expect(isInternationalPhone("+971 123")).toBe(false);
  });

  it("keeps the product's core Gulf and India countries available before the API responds", () => {
    expect(FALLBACK_PHONE_COUNTRIES.map((country) => country.code)).toEqual(
      expect.arrayContaining(["AE", "SA", "BH", "IN"]),
    );
  });
});
