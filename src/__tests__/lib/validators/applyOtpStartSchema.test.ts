/**
 * Quick apply sends a name: without one the account, and the application the
 * employer reviews, were named after the email's local part (audit 2026-09-24,
 * JRN-05b). The login page sends none; the route then mails a code only to an
 * existing job seeker, so no account is made without a name
 * (applyOtpStart.test.ts, "log in with a code").
 */
import { applyOtpStartSchema } from "@/lib/validators/applyOtp";

it("refuses a blank name, and takes a request with none (the login page)", () => {
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co", name: "   " }).success).toBe(false);
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co", name: "" }).success).toBe(false);
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co" }).success).toBe(true);
});

it("trims the name", () => {
  const parsed = applyOtpStartSchema.parse({ email: "a@b.co", name: "  Jane Doe " });
  expect(parsed.name).toBe("Jane Doe");
});

it("caps the name length", () => {
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co", name: "x".repeat(201) }).success).toBe(false);
});
