/**
 * @jest-environment node
 *
 * A password changed from inside the app emails the account holder, the same
 * notice the reset flow sends. It goes straight through sendEmail, so no
 * notification preference can stop it (owner's call, 2026-09-30: password
 * emails always arrive).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const userFindById = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: (...args: unknown[]) => userFindById(...args) },
}));

const sendEmail = jest.fn().mockResolvedValue({ messageId: "m-1" });
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  EmailTemplates: {
    passwordResetConfirmation: (dateTime: string) => ({ subject: "Your MPLOYEDIN Password Was Changed", html: dateTime }),
  },
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn().mockResolvedValue({ user: { id: "user-1", role: "job_seeker" } }),
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true, resetAt: Date.now() }),
}));

const compare = jest.fn();
jest.mock("bcryptjs", () => ({
  compare: (...args: unknown[]) => compare(...args),
  hash: jest.fn().mockResolvedValue("new-hash"),
}));

import { POST } from "@/app/api/users/change-password/route";

function changePassword() {
  return POST(
    new NextRequest("http://localhost/api/users/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "OldPassword1!", newPassword: "NewPassword1!" }),
    }),
  );
}

describe("/api/users/change-password", () => {
  beforeEach(() => {
    sendEmail.mockClear();
  });

  it("emails the account holder that the password changed", async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    compare.mockResolvedValue(true);
    userFindById.mockReturnValue({
      select: () => Promise.resolve({ email: "seeker@example.org", passwordHash: "old-hash", save }),
    });

    const res = await changePassword();

    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "seeker@example.org",
        subject: "Your MPLOYEDIN Password Was Changed",
        category: "security",
      }),
    );
  });

  it("sends nothing when the current password is wrong", async () => {
    const save = jest.fn();
    compare.mockResolvedValue(false);
    userFindById.mockReturnValue({
      select: () => Promise.resolve({ email: "seeker@example.org", passwordHash: "old-hash", save }),
    });

    const res = await changePassword();

    expect(res.status).toBe(403);
    expect(save).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
