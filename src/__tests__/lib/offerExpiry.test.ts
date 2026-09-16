/**
 * @jest-environment node
 */
import { defaultOfferExpiry } from "@/lib/offers/expiry";

const DAY = 24 * 60 * 60 * 1000;

describe("defaultOfferExpiry", () => {
  it("gives the candidate a week when the start date is far off", () => {
    const startDate = new Date(Date.now() + 30 * DAY);
    const expiry = defaultOfferExpiry(startDate);
    expect(expiry.getTime()).toBeCloseTo(Date.now() + 7 * DAY, -4);
  });

  it("never lands after the start date when the job starts within the week", () => {
    const startDate = new Date(Date.now() + 2 * DAY);
    expect(defaultOfferExpiry(startDate).getTime()).toBe(startDate.getTime());
  });

  it("returns an expiry the create schema accepts for a near start date", async () => {
    const { offerCreateSchema } = await import("@/lib/validators/offers");
    const startDate = new Date(Date.now() + 2 * DAY);
    const result = offerCreateSchema.safeParse({
      applicationId: "6a9eee5a1c2d3e4f5a6b7c8d",
      salary: { amount: 12000, currency: "AED", period: "monthly" },
      startDate: startDate.toISOString(),
      expiresAt: defaultOfferExpiry(startDate).toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
