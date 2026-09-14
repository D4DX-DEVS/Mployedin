/**
 * @jest-environment node
 *
 * Guards the shape of PendingSignin, the holding area for quick-apply codes.
 * If someone drops the TTL index or the unique email, abandoned rows would
 * pile up forever and one address could hold several live codes.
 */
import PendingSignin, { PENDING_SIGNIN_MAX_ATTEMPTS, PENDING_SIGNIN_TTL_MS } from "@/models/PendingSignin";

describe("PendingSignin model", () => {
  test("rows expire on their own (TTL index on expiresAt)", () => {
    const indexes = PendingSignin.schema.indexes() as Array<
      [Record<string, unknown>, { expireAfterSeconds?: number } | undefined]
    >;
    const ttl = indexes.find(([fields, opts]) => fields.expiresAt === 1 && opts?.expireAfterSeconds === 0);
    expect(ttl).toBeDefined();
  });

  test("one row per email, stored lowercase", () => {
    const email = PendingSignin.schema.path("email") as unknown as { options: Record<string, unknown> };
    expect(email.options.unique).toBe(true);
    expect(email.options.lowercase).toBe(true);
    expect(email.options.required).toBe(true);
  });

  test("stores a hash and an attempt counter, never a plaintext code field", () => {
    expect(PendingSignin.schema.path("otpHash")).toBeDefined();
    expect(PendingSignin.schema.path("attempts")).toBeDefined();
    expect(PendingSignin.schema.path("otp")).toBeUndefined();
    expect(PendingSignin.schema.path("code")).toBeUndefined();
  });

  test("code lifetime is 10 minutes and the guess budget is small", () => {
    expect(PENDING_SIGNIN_TTL_MS).toBe(10 * 60 * 1000);
    expect(PENDING_SIGNIN_MAX_ATTEMPTS).toBeLessThanOrEqual(5);
  });
});
