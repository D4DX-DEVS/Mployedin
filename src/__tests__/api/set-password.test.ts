/**
 * @jest-environment node
 *
 * An account made by an e-mail code (shared job link) or by Google has no
 * password, and Settings asked for a "current password" that did not exist.
 * POST /api/users/set-password gives such an account its first one. It never
 * replaces an existing password: that stays behind the current-password check
 * in /api/users/change-password.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

// findOneAndUpdate(...).lean() resolves to the account the write landed on, or null.
let updated: { email?: string } | null = { email: "seeker@example.org" };
const findOneAndUpdate = jest.fn((..._args: unknown[]) => ({ lean: async () => updated }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findOneAndUpdate: (...args: unknown[]) => findOneAndUpdate(...args) },
}));

const sendEmail = jest.fn().mockResolvedValue({ messageId: "m-1" });
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  EmailTemplates: {
    passwordResetConfirmation: (dateTime: string) => ({ subject: "Your MPLOYEDIN Password Was Changed", html: dateTime }),
  },
}));

const nowSec = () => Math.floor(Date.now() / 1000);
/** Signed in a minute ago, with a stale copy of the address in the session. */
const sessionAt = (authAt: number) => ({
  user: { id: "user-1", role: "job_seeker", email: "old-address@example.org", authAt },
});
let session: unknown = sessionAt(nowSec() - 60);
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn(async () => session) }));

let allowed = true;
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed, resetAt: Date.now() + 1000 })),
}));

const hash = jest.fn().mockResolvedValue("new-hash");
jest.mock("bcryptjs", () => ({ hash: (...args: unknown[]) => hash(...args) }));

import { POST } from "@/app/api/users/set-password/route";

function setPassword(body: unknown = { newPassword: "Str0ng!Passw0rd" }) {
  return POST(
    new NextRequest("http://localhost/api/users/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  session = sessionAt(nowSec() - 60);
  allowed = true;
  updated = { email: "seeker@example.org" };
  findOneAndUpdate.mockClear();
  sendEmail.mockClear();
  logActivity.mockClear();
  hash.mockClear();
});

describe("POST /api/users/set-password", () => {
  it("stores the first password, only on an account that has none", async () => {
    const res = await setPassword();

    expect(res.status).toBe(200);
    expect(hash).toHaveBeenCalledWith("Str0ng!Passw0rd", 12);
    // The no-password condition is part of the write itself, so two requests
    // (or a password set elsewhere in between) cannot both land.
    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(filter).toMatchObject({ _id: "user-1", isActive: true, passwordHash: { $in: [null, ""] } });
    expect(update).toEqual({ $set: { passwordHash: "new-hash" } });
  });

  it("is refused to a session older than the removal of an unproven password", async () => {
    // lib/auth/unprovenPassword.ts empties the password and stamps
    // sessionsValidAfter. A session the removed password opened is signed out
    // at its next re-check, up to five minutes later; until then it must not
    // be able to put a password of its own back on the now-verified account.
    const authAt = nowSec() - 60;
    session = sessionAt(authAt);
    await setPassword();

    const [filter] = findOneAndUpdate.mock.calls[0] as [{ $or?: unknown }];
    // A session with only whole seconds: anything stamped in its sign-in second passes.
    expect(filter.$or).toEqual([
      { sessionsValidAfter: null },
      { sessionsValidAfter: { $lte: new Date((authAt + 1) * 1000 - 1) } },
    ]);
  });

  it("compares in milliseconds when the session carries them", async () => {
    // Same-second sign-ins: one from just before the clean-up must not pass.
    const authAt = nowSec() - 60;
    const authAtMs = authAt * 1000 + 250;
    session = { user: { ...sessionAt(authAt).user, authAtMs } };
    await setPassword();

    const [filter] = findOneAndUpdate.mock.calls[0] as [{ $or?: unknown }];
    expect(filter.$or).toEqual([{ sessionsValidAfter: null }, { sessionsValidAfter: { $lte: new Date(authAtMs) } }]);
  });

  it("keeps the session that set it: passwordChangedAt would sign the person out", async () => {
    await setPassword();
    expect(JSON.stringify(findOneAndUpdate.mock.calls[0][1])).not.toContain("passwordChangedAt");
  });

  it("tells the account holder by e-mail, at the address on the account, and records it", async () => {
    // The session's copy of the address can be stale after an e-mail change.
    await setPassword();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "seeker@example.org", category: "security", source: "password-set" }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "user.set_password", actorId: "user-1" }));
  });

  it("refuses an account that already has a password", async () => {
    updated = null;
    const res = await setPassword();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("PASSWORD_ALREADY_SET");
    expect(sendEmail).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("applies the sign-up password policy", async () => {
    const res = await setPassword({ newPassword: "short" });
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("needs a session", async () => {
    session = null;
    expect((await setPassword()).status).toBe(401);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    allowed = false;
    const res = await setPassword();
    expect(res.status).toBe(429);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  describe("needs a recent sign-in", () => {
    // A password is a permanent way in, and with one the e-mail address can be
    // changed. A session that was stolen, or left open on a shared computer,
    // must not be able to mint one: only a sign-in from the last 15 minutes can.
    it("refuses a session that signed in more than 15 minutes ago", async () => {
      session = sessionAt(nowSec() - 16 * 60);
      const res = await setPassword();
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe("REAUTH_REQUIRED");
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("refuses a session that carries no sign-in time (issued before this rule)", async () => {
      session = { user: { id: "user-1", role: "job_seeker", email: "seeker@example.org" } };
      const res = await setPassword();
      expect(res.status).toBe(403);
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("refuses a sign-in time from the future", async () => {
      session = sessionAt(nowSec() + 3600);
      expect((await setPassword()).status).toBe(403);
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
