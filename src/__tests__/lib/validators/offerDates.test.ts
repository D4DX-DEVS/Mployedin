/**
 * @jest-environment node
 */
import { offerCreateSchema, offerReviseSchema } from "@/lib/validators/offers";

// An offer's expiry is the candidate's deadline to respond, so it must sit
// between now and the start date. Neither bound was enforced, which is how a
// live offer ended up advertising "Expires 7/17" against a start date of 8/9.
const DAY = 24 * 60 * 60 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const salary = { amount: 12000, currency: "AED", period: "monthly" as const };
const OBJECT_ID = "6a9eee5a1c2d3e4f5a6b7c8d";

const createPayload = (startOffset: number, expiresOffset?: number) => ({
  applicationId: OBJECT_ID,
  salary,
  startDate: iso(startOffset),
  ...(expiresOffset === undefined ? {} : { expiresAt: iso(expiresOffset) }),
});

const revisePayload = (startOffset: number, expiresOffset?: number) => {
  const { applicationId: _applicationId, ...rest } = createPayload(startOffset, expiresOffset);
  return rest;
};

describe.each([
  ["offerCreateSchema", offerCreateSchema, createPayload],
  ["offerReviseSchema", offerReviseSchema, revisePayload],
])("%s expiry bounds", (_name, schema, payload) => {
  it("accepts an expiry between now and the start date", () => {
    expect(schema.safeParse(payload(30 * DAY, 7 * DAY)).success).toBe(true);
  });

  it("accepts an expiry falling exactly on the start date", () => {
    const startDate = iso(30 * DAY);
    const base = payload(30 * DAY, 7 * DAY) as Record<string, unknown>;
    expect(schema.safeParse({ ...base, startDate, expiresAt: startDate }).success).toBe(true);
  });

  it("accepts an omitted expiry so the route can apply its default", () => {
    expect(schema.safeParse(payload(30 * DAY)).success).toBe(true);
  });

  it("rejects an expiry already in the past", () => {
    const result = schema.safeParse(payload(30 * DAY, -1 * DAY));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("expiresAt"))).toBe(true);
    }
  });

  it("rejects an expiry that falls after the start date", () => {
    const result = schema.safeParse(payload(7 * DAY, 30 * DAY));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("expiresAt"))).toBe(true);
    }
  });
});
