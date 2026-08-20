import { toUserFacingError } from "@/lib/errors/user-facing";

const copy = {
  fallback: "We could not complete this action. Nothing was changed. Try again.",
  network: "The connection was interrupted. Your changes were not sent. Try again.",
  permission: "You do not have access to this action.",
  rateLimit: "Too many attempts. Wait a moment and try again.",
  conflict: "This record changed while you were editing. Review the latest version.",
  validation: "Review the highlighted information and try again.",
};

describe("toUserFacingError", () => {
  it("never exposes an unknown raw exception message", () => {
    const result = toUserFacingError(
      new Error("MongoServerError: secret.internal.example collection users"),
      copy,
    );

    expect(result.message).toBe(copy.fallback);
    expect(result.message).not.toContain("MongoServerError");
  });

  it.each([
    [new TypeError("Failed to fetch"), "network", copy.network, true],
    [{ status: 403, message: "Forbidden" }, "permission", copy.permission, false],
    [{ status: 429, message: "Too many requests" }, "rate-limit", copy.rateLimit, true],
    [{ status: 409, message: "Conflict" }, "conflict", copy.conflict, false],
    [{ status: 422, message: "Validation failed" }, "validation", copy.validation, false],
  ])("maps %p to safe %s guidance", (error, kind, message, retryable) => {
    expect(toUserFacingError(error, copy)).toMatchObject({ kind, message, retryable });
  });

  it("includes only non-sensitive support codes", () => {
    expect(toUserFacingError({ digest: "abc_1234" }, copy).supportCode).toBe("abc_1234");
    expect(
      toUserFacingError({ digest: "token user@example.com" }, copy).supportCode,
    ).toBeUndefined();
  });
});
