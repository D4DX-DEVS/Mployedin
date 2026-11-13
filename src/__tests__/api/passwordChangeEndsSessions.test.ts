/**
 * @jest-environment node
 *
 * Changing or resetting a password must end every session the old password
 * could have opened: other browsers, other devices, this one too, and the
 * app grants (MCP access and refresh tokens). Before, both routes only set
 * `passwordChangedAt`, which the session check compared with the JWT's `iat`
 * — rewritten on every cookie re-issue, so a session in use (the thief's)
 * always looked newer than the change and stayed signed in.
 *
 * Both routes now set the account's `sessionsValidAfter` in the same write as
 * the new password and hand the account to lib/auth/sessionCutOff.ts.
 */
import { NextRequest } from "next/server";
import crypto from "crypto";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: "m1" }),
  EmailTemplates: { passwordResetConfirmation: jest.fn(() => ({ subject: "s", html: "h" })) },
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true, resetAt: Date.now() + 1000 })),
}));
jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(async () => ({ user: { id: "user-1", role: "employer" } })),
}));
jest.mock("bcryptjs", () => {
  const api = {
    compare: jest.fn(async () => true),
    genSalt: jest.fn(async () => "salt"),
    hash: jest.fn(async () => "new-hash"),
  };
  return { __esModule: true, default: api, ...api };
});
const endAllSessions = jest.fn(async (..._a: unknown[]) => undefined);
const noteSessionsCutOff = jest.fn();
jest.mock("@/lib/auth/sessionCutOff", () => ({
  endAllSessions: (...a: unknown[]) => endAllSessions(...a),
  noteSessionsCutOff: (...a: unknown[]) => noteSessionsCutOff(...a),
}));
jest.mock("@/lib/auth/unprovenPassword", () => ({
  unprovenAccessCleanup: jest.requireActual("@/lib/auth/unprovenPassword").unprovenAccessCleanup,
  revokeUnprovenAccessElsewhere: jest.fn(async () => undefined),
}));
jest.mock("@/models/Webhook", () => ({ Webhook: {} }));
jest.mock("@/models/ApiKey", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/PushSubscription", () => ({ __esModule: true, PushSubscription: {}, default: {} }));

const findById = jest.fn();
const findOne = jest.fn();
const updateOne = jest.fn(async (..._a: unknown[]) => ({ modifiedCount: 1 }));
jest.mock("@/models/User", () => {
  const model = {
    findById: (...a: unknown[]) => findById(...a),
    findOne: (...a: unknown[]) => findOne(...a),
    updateOne: (...a: unknown[]) => updateOne(...a),
    findByIdAndUpdate: jest.fn().mockResolvedValue(null),
  };
  return { __esModule: true, default: model, User: model };
});

import { POST as changePassword } from "@/app/api/users/change-password/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  endAllSessions.mockClear();
  noteSessionsCutOff.mockClear();
  updateOne.mockClear();
});

describe("POST /api/users/change-password", () => {
  function account() {
    const doc: Record<string, unknown> = {
      _id: "user-1",
      email: "owner@example.org",
      passwordHash: "old-hash",
      save: jest.fn(async () => undefined),
    };
    findById.mockReturnValue({ select: () => Promise.resolve(doc) });
    return doc;
  }
  const change = () => changePassword(post("/api/users/change-password", { currentPassword: "Old!Passw0rd#1", newPassword: "Str0ng!Passw0rd#" }));

  it("sets the cut-off in the same save as the new password", async () => {
    const before = Date.now();
    const doc = account();

    const res = await change();

    expect(res.status).toBe(200);
    expect(doc.passwordHash).toBe("new-hash");
    expect(doc.sessionsValidAfter).toBeInstanceOf(Date);
    expect((doc.sessionsValidAfter as Date).getTime()).toBeGreaterThanOrEqual(before);
    // MCP grants are still cut on passwordChangedAt: the same moment.
    expect(doc.passwordChangedAt).toEqual(doc.sessionsValidAfter);
    expect(doc.save).toHaveBeenCalledTimes(1);
  });

  it("ends every session and app grant of the account, after the save", async () => {
    const doc = account();
    (doc.save as jest.Mock).mockImplementation(async () => {
      expect(endAllSessions).not.toHaveBeenCalled();
    });

    await change();

    expect(endAllSessions).toHaveBeenCalledWith("user-1", doc.sessionsValidAfter);
  });

  it("tells the page this session ended too, so it signs out", async () => {
    account();
    const res = await change();
    expect(await res.json()).toEqual({ success: true, signedOut: true });
  });

  it("ends nothing when the current password is wrong", async () => {
    const bcrypt = jest.requireMock("bcryptjs") as { compare: jest.Mock };
    bcrypt.compare.mockResolvedValueOnce(false);
    const doc = account();

    const res = await change();

    expect(res.status).toBe(403);
    expect(doc.sessionsValidAfter).toBeUndefined();
    expect(endAllSessions).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/reset-password", () => {
  function resetting(fields: Record<string, unknown>) {
    const doc: Record<string, unknown> = {
      _id: { toString: () => "user-1" },
      email: "owner@example.org",
      role: "employer",
      passwordResetAttempts: 0,
      save: jest.fn(async () => undefined),
      ...fields,
    };
    findOne.mockReturnValue({ select: () => Promise.resolve(doc) });
    return doc;
  }
  const reset = () => resetPassword(post("/api/auth/reset-password", { token: "reset-token", password: "Str0ng!Passw0rd#" }));

  it("on a confirmed account, sets the cut-off with the new password and ends every session", async () => {
    // Someone who knew the old password (the reason for most resets) is
    // signed in somewhere: that session must end.
    const doc = resetting({ isEmailVerified: true });

    const res = await reset();

    expect(res.status).toBe(200);
    expect(doc.passwordHash).toBe("new-hash");
    expect(doc.sessionsValidAfter).toBeInstanceOf(Date);
    expect(doc.passwordChangedAt).toEqual(doc.sessionsValidAfter);
    expect(doc.save).toHaveBeenCalledTimes(1);
    expect(endAllSessions).toHaveBeenCalledWith("user-1", doc.sessionsValidAfter);
  });

  it("on an unconfirmed account, the one write carries the cut-off and this server learns it at once", async () => {
    resetting({ isEmailVerified: false });

    const res = await reset();

    expect(res.status).toBe(200);
    const [filter, update] = updateOne.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { $set: Record<string, unknown> },
    ];
    expect(filter.passwordResetToken).toBe(crypto.createHash("sha256").update("reset-token").digest("hex"));
    expect(update.$set.sessionsValidAfter).toBeInstanceOf(Date);
    expect(noteSessionsCutOff).toHaveBeenCalledWith("user-1", update.$set.sessionsValidAfter);
  });

  it("ends nothing when the link is no good", async () => {
    findOne.mockReturnValue({ select: () => Promise.resolve(null) });
    const res = await reset();
    expect(res.status).toBe(400);
    expect(endAllSessions).not.toHaveBeenCalled();
    expect(noteSessionsCutOff).not.toHaveBeenCalled();
  });
});
