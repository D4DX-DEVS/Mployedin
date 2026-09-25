/**
 * Quick apply must ask for a name: without one the account, and the application
 * the employer reviews, were named after the email's local part (audit
 * 2026-09-24, JRN-05b).
 */
import { applyOtpStartSchema } from "@/lib/validators/applyOtp";

it("requires a non-blank name", () => {
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co" }).success).toBe(false);
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co", name: "   " }).success).toBe(false);
});

it("trims the name", () => {
  const parsed = applyOtpStartSchema.parse({ email: "a@b.co", name: "  Jane Doe " });
  expect(parsed.name).toBe("Jane Doe");
});

it("caps the name length", () => {
  expect(applyOtpStartSchema.safeParse({ email: "a@b.co", name: "x".repeat(201) }).success).toBe(false);
});
