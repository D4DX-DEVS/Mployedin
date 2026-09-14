/**
 * @jest-environment node
 */
import { hashOtp, otpHashesMatch } from "@/lib/auth/emailVerification";

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret-at-least-32-chars-long-000";
});

describe("otpHashesMatch", () => {
  test("equal digests match", () => {
    const a = hashOtp("123456", "signin");
    expect(otpHashesMatch(a, hashOtp("123456", "signin"))).toBe(true);
  });

  test("different codes do not match", () => {
    expect(otpHashesMatch(hashOtp("123456", "signin"), hashOtp("123457", "signin"))).toBe(false);
  });

  test("a signup-verification digest never matches the sign-in digest for the same code", () => {
    expect(otpHashesMatch(hashOtp("123456", "verify"), hashOtp("123456", "signin"))).toBe(false);
  });

  test.each([
    ["empty", "", ""],
    ["length mismatch", "abcd", "abcdef"],
    ["non-hex", "zz".repeat(32), "zz".repeat(32)],
  ])("%s is false without throwing", (_label, a, b) => {
    expect(otpHashesMatch(a, b)).toBe(false);
  });

  test("tolerates non-string input from a corrupted row", () => {
    expect(otpHashesMatch(hashOtp("1", "signin"), undefined as unknown as string)).toBe(false);
  });
});
