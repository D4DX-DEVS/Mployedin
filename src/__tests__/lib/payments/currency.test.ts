/**
 * @jest-environment node
 */
import { toMinorUnits, fromMinorUnits, currencyExponent } from "@/lib/payments/currency";

describe("payment minor units", () => {
  it("uses 2 decimals for AED / SAR / QAR / INR / USD", () => {
    for (const c of ["AED", "SAR", "QAR", "INR", "usd"]) {
      expect(currencyExponent(c)).toBe(2);
      expect(toMinorUnits(199.99, c)).toBe(19999);
      expect(fromMinorUnits(19999, c)).toBe(199.99);
    }
  });

  it("avoids float drift (0.1 + 0.2 style amounts)", () => {
    expect(toMinorUnits(1.005 + 0.0000001, "AED")).toBe(101);
    expect(toMinorUnits(19.99, "AED")).toBe(1999);
    expect(toMinorUnits(0.1 + 0.2, "AED")).toBe(30);
  });

  it("uses 3 decimals for KWD / BHD / OMR with a trailing 0 (provider rule)", () => {
    for (const c of ["KWD", "BHD", "OMR", "JOD", "TND"]) {
      expect(currencyExponent(c)).toBe(3);
      expect(toMinorUnits(12.34, c)).toBe(12340);
      // 12.345 cannot be charged — rounded to whole hundredths, last digit 0
      const minor = toMinorUnits(12.345, c);
      expect(minor % 10).toBe(0);
      expect(fromMinorUnits(12340, c)).toBe(12.34);
    }
  });

  it("sends zero-decimal currencies as-is", () => {
    expect(currencyExponent("JPY")).toBe(0);
    expect(toMinorUnits(1500, "JPY")).toBe(1500);
    expect(fromMinorUnits(1500, "JPY")).toBe(1500);
  });

  it("rejects negative / non-finite amounts", () => {
    expect(() => toMinorUnits(-1, "AED")).toThrow();
    expect(() => toMinorUnits(Number.NaN, "AED")).toThrow();
  });
});
