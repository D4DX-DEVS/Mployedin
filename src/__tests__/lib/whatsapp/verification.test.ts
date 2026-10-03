/**
 * @jest-environment node
 */
import { isWhatsAppNumberVerified } from "@/lib/communications/whatsapp/verification";

// A START verifies the number it came from (webhookHandlers.ts records "+<wa_id>"); sends go out only
// while that is still the number on the profile, compared in the form send.ts sends to.
describe("isWhatsAppNumberVerified", () => {
  it("is true when the verified number is the profile phone, however the phone was typed", () => {
    expect(isWhatsAppNumberVerified("+971501234567", "+971501234567")).toBe(true);
    expect(isWhatsAppNumberVerified("+971 50 123 4567", "+971501234567")).toBe(true);
    expect(isWhatsAppNumberVerified("971501234567", "+971501234567")).toBe(true);
  });

  it("is false when no START was ever received", () => {
    expect(isWhatsAppNumberVerified("+971501234567", undefined)).toBe(false);
    expect(isWhatsAppNumberVerified("+971501234567", null)).toBe(false);
    expect(isWhatsAppNumberVerified("+971501234567", "")).toBe(false);
  });

  it("is false when the START came from another number", () => {
    expect(isWhatsAppNumberVerified("+971501234567", "+971507654321")).toBe(false);
  });

  it("is false with no phone, or a phone that cannot be sent to", () => {
    expect(isWhatsAppNumberVerified(undefined, "+971501234567")).toBe(false);
    expect(isWhatsAppNumberVerified("", "+971501234567")).toBe(false);
    // National format: no country code, so no number to compare (send.ts rejects it too).
    expect(isWhatsAppNumberVerified("0501234567", "+0501234567")).toBe(false);
  });
});
