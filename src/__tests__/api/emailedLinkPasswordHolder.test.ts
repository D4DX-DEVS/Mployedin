/**
 * @jest-environment node
 *
 * The emailed links that mark an address confirmed — "verify your email" and
 * "confirm your new email" — finish only for the person who holds the
 * account's password (lib/auth/passwordHolder.ts). Before, a stranger could
 * register the owner's address with a password of their own, and the owner's
 * one click on the mail they were sent left a verified account that stranger
 * could log in to. Reset-password stays the way out for an owner who does not
 * know the password, and it now clears what the stranger's password set up.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: Date.now() + 1000 })),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: "m1" }),
  EmailTemplates: {
    emailChangeCompleted: jest.fn(() => ({ subject: "s", html: "h" })),
    passwordResetConfirmation: jest.fn(() => ({ subject: "s", html: "h" })),
  },
}));
const compare = jest.fn(async (..._a: unknown[]) => true);
jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    compare: (...a: unknown[]) => compare(...a),
    genSalt: jest.fn().mockResolvedValue("salt"),
    hash: jest.fn().mockResolvedValue("new-hash"),
  },
}));
let session: unknown = null;
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => session) }));
const endAllSessions = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@/lib/auth/sessionCutOff", () => ({
  endAllSessions: (...a: unknown[]) => endAllSessions(...a),
  noteSessionsCutOff: jest.fn(),
}));
const revokeUnprovenAccessElsewhere = jest.fn(async (..._a: unknown[]) => undefined);
jest.mock("@/lib/auth/unprovenPassword", () => ({
  unprovenAccessCleanup: jest.requireActual("@/lib/auth/unprovenPassword").unprovenAccessCleanup,
  revokeUnprovenAccessElsewhere: (...a: unknown[]) => revokeUnprovenAccessElsewhere(...a),
}));

const findOne = jest.fn();
const exists = jest.fn().mockResolvedValue(null);
const updateOne = jest.fn(async (..._a: unknown[]) => ({ modifiedCount: 1 }));
jest.mock("@/models/User", () => ({
  User: {
    findOne: (...a: unknown[]) => findOne(...a),
    exists: (...a: unknown[]) => exists(...a),
    updateOne: (...a: unknown[]) => updateOne(...a),
    findOneAndUpdate: jest.fn().mockResolvedValue({ emailVerificationAttempts: 1 }),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  },
}));
// unprovenPassword.ts is partly real here; its models are not used by the cases below.
jest.mock("@/models/Webhook", () => ({ Webhook: {} }));
jest.mock("@/models/ApiKey", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/PushSubscription", () => ({ __esModule: true, PushSubscription: {}, default: {} }));

import { POST as verifyEmail } from "@/app/api/auth/verify-email/route";
import { POST as confirmEmailChange } from "@/app/api/auth/confirm-email-change/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { hashOtp } from "@/lib/auth/emailVerification";
import crypto from "crypto";

const post = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });

type Doc = Record<string, unknown> & { save: jest.Mock };
function account(fields: Record<string, unknown> = {}): Doc {
  return {
    _id: { toString: () => "user-1" },
    email: "owner@example.org",
    name: "Owner",
    role: "employer",
    isEmailVerified: false,
    passwordHash: "stranger-hash",
    save: jest.fn().mockResolvedValue(undefined),
    ...fields,
  };
}
let selected = "";
const found = (doc: Doc | null) =>
  findOne.mockReturnValue({
    select: jest.fn((projection: string) => {
      selected = projection;
      return Promise.resolve(doc);
    }),
  });

beforeAll(() => {
  process.env.NEXTAUTH_SECRET = "test-secret";
});
beforeEach(() => {
  jest.clearAllMocks();
  session = null;
  selected = "";
  compare.mockResolvedValue(true);
});

describe("POST /api/auth/verify-email", () => {
  it("asks for the password when the link is opened with no session, and changes nothing", async () => {
    const doc = account();
    found(doc);

    const res = await verifyEmail(post("/api/auth/verify-email", { token: "link-token" }));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("PASSWORD_REQUIRED");
    expect(doc.isEmailVerified).toBe(false);
    expect(doc.save).not.toHaveBeenCalled();
    // The stored hash is read only to check a typed password, never returned.
    expect(selected).toContain("+passwordHash");
  });

  it("confirms with the account's password typed on the page", async () => {
    const doc = account();
    found(doc);

    const res = await verifyEmail(post("/api/auth/verify-email", { token: "link-token", password: "Str0ng!Passw0rd" }));

    expect(res.status).toBe(200);
    expect(compare).toHaveBeenCalledWith("Str0ng!Passw0rd", "stranger-hash");
    expect(doc.isEmailVerified).toBe(true);
    expect(doc.save).toHaveBeenCalled();
  });

  it("refuses a wrong password and leaves the link usable", async () => {
    compare.mockResolvedValue(false);
    const doc = account({ emailVerificationToken: "hashed-token" });
    found(doc);

    const res = await verifyEmail(post("/api/auth/verify-email", { token: "link-token", password: "guess" }));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("WRONG_PASSWORD");
    expect(doc.isEmailVerified).toBe(false);
    expect(doc.emailVerificationToken).toBe("hashed-token");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("confirms straight away inside the account's own session", async () => {
    session = { user: { id: "user-1" } };
    const doc = account();
    found(doc);

    const res = await verifyEmail(post("/api/auth/verify-email", { token: "link-token" }));

    expect(res.status).toBe(200);
    expect(doc.isEmailVerified).toBe(true);
    expect(compare).not.toHaveBeenCalled();
  });

  it("asks for the password when another account is signed in on this browser", async () => {
    session = { user: { id: "someone-else" } };
    found(account());

    const res = await verifyEmail(post("/api/auth/verify-email", { token: "link-token" }));

    expect((await res.json()).code).toBe("PASSWORD_REQUIRED");
  });

  it("applies the same rule to the 6-digit code from the same mail", async () => {
    // The code sits in the same mail as the link, and the code form is open to
    // anyone who types the address in.
    const doc = account({ emailVerificationOtp: hashOtp("123456"), emailVerificationExpiry: new Date(Date.now() + 60_000) });
    found(doc);

    const res = await verifyEmail(post("/api/auth/verify-email", { otp: "123456", email: "owner@example.org" }));

    expect((await res.json()).code).toBe("PASSWORD_REQUIRED");
    expect(doc.save).not.toHaveBeenCalled();
  });

  it("still says an unknown link is invalid, before anything else", async () => {
    found(null);
    const res = await verifyEmail(post("/api/auth/verify-email", { token: "nope", password: "x" }));
    expect(res.status).toBe(400);
    expect(compare).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/confirm-email-change", () => {
  const changing = (fields: Record<string, unknown> = {}) =>
    account({ isEmailVerified: true, email: "old@example.org", pendingEmail: "new@example.org", ...fields });

  it("asks for the password with no session, and moves no address", async () => {
    // Otherwise: a stranger's verified account requests a change to the
    // owner's address, the owner clicks "confirm", and the stranger now holds
    // a verified account under the owner's address.
    const doc = changing();
    found(doc);

    const res = await confirmEmailChange(post("/api/auth/confirm-email-change", { token: "change-token" }));

    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe("PASSWORD_REQUIRED");
    expect(doc.email).toBe("old@example.org");
    expect(doc.save).not.toHaveBeenCalled();
    expect(selected).toContain("+passwordHash");
    // A list of fields is an inclusive projection: the lockout must be in it.
    expect(selected.split(" ")).toContain("lockUntil");
  });

  it("moves the address with the account's password typed on the page", async () => {
    const doc = changing();
    found(doc);

    const res = await confirmEmailChange(post("/api/auth/confirm-email-change", { token: "change-token", password: "Str0ng!Passw0rd" }));

    expect(res.status).toBe(200);
    expect(doc.email).toBe("new@example.org");
  });

  it("moves it straight away inside the account's own session", async () => {
    session = { user: { id: "user-1" } };
    const doc = changing();
    found(doc);

    const res = await confirmEmailChange(post("/api/auth/confirm-email-change", { token: "change-token" }));

    expect(res.status).toBe(200);
    expect(doc.email).toBe("new@example.org");
  });
});

describe("POST /api/auth/reset-password", () => {
  const resetting = (fields: Record<string, unknown> = {}) => account({ passwordResetAttempts: 0, ...fields });

  it("on an unconfirmed account, sets the new password and clears the old one's leftovers in ONE write", async () => {
    // The owner who could not confirm (they do not know the stranger's
    // password) resets it. Sessions the old password opened, a pending address
    // change and the rest go in the same write that confirms the account, so
    // a failure cannot leave the owner with no password and no confirmation.
    const doc = resetting();
    found(doc);

    const res = await resetPassword(post("/api/auth/reset-password", { token: "reset-token", password: "Str0ng!Passw0rd#" }));

    expect(res.status).toBe(200);
    expect(doc.save).not.toHaveBeenCalled();
    const [filter, update] = updateOne.mock.calls[0] as [Record<string, unknown>, { $set: Record<string, unknown>; $unset: Record<string, unknown> }];
    expect(filter).toEqual({
      _id: doc._id,
      passwordResetToken: crypto.createHash("sha256").update("reset-token").digest("hex"),
      // The link may expire while the password is hashed.
      passwordResetExpiry: { $gt: expect.any(Date) },
      isEmailVerified: { $ne: true },
    });
    expect(update.$set).toMatchObject({ passwordHash: "new-hash", isEmailVerified: true, passwordResetAttempts: 0 });
    expect(update.$set.sessionsValidAfter).toBeInstanceOf(Date);
    expect(update.$unset).toMatchObject({ passwordResetToken: "", passwordResetExpiry: "", pendingEmail: "", "whatsapp.verifiedNumber": "" });
    expect(update.$unset).not.toHaveProperty("passwordHash");
    expect(revokeUnprovenAccessElsewhere).toHaveBeenCalledWith("user-1");
  });

  it("refuses the link when the account changed in between, and clears nothing outside it", async () => {
    updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
    found(resetting());

    const res = await resetPassword(post("/api/auth/reset-password", { token: "reset-token", password: "Str0ng!Passw0rd#" }));

    expect(res.status).toBe(400);
    expect(revokeUnprovenAccessElsewhere).not.toHaveBeenCalled();
  });

  it("on a confirmed account, replaces the password and ends its sessions (no unproven-password clean-up)", async () => {
    const doc = resetting({ isEmailVerified: true });
    found(doc);

    const res = await resetPassword(post("/api/auth/reset-password", { token: "reset-token", password: "Str0ng!Passw0rd#" }));

    expect(res.status).toBe(200);
    expect(doc.save).toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
    expect(revokeUnprovenAccessElsewhere).not.toHaveBeenCalled();
    expect(endAllSessions).toHaveBeenCalledWith("user-1", expect.any(Date));
  });
});
