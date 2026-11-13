/**
 * @jest-environment node
 *
 * Anyone can register someone else's address with a password of their own; the
 * account stays unverified. When the real owner later proved the mailbox (an
 * e-mail code, or Google / LinkedIn / Apple), the account was marked verified
 * and that stranger's password kept working. The owner was not told, and could
 * not change it without knowing it.
 *
 * `dropUnprovenPassword` removes that password in the same step that proves
 * the mailbox, ends the sessions it opened, and clears what it could have left
 * behind to get back in or to keep receiving the owner's messages.
 */
const updateOne = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { updateOne: (...a: unknown[]) => updateOne(...a) },
}));
const webhookUpdateMany = jest.fn();
jest.mock("@/models/Webhook", () => ({
  __esModule: true,
  Webhook: { updateMany: (...a: unknown[]) => webhookUpdateMany(...a) },
}));
const apiKeyUpdateMany = jest.fn();
jest.mock("@/models/ApiKey", () => ({
  __esModule: true,
  default: { updateMany: (...a: unknown[]) => apiKeyUpdateMany(...a) },
}));
const pushDeleteMany = jest.fn();
jest.mock("@/models/PushSubscription", () => ({
  __esModule: true,
  PushSubscription: { deleteMany: (...a: unknown[]) => pushDeleteMany(...a) },
  default: { deleteMany: (...a: unknown[]) => pushDeleteMany(...a) },
}));
const logActivity = jest.fn();
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));
const logError = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: (...a: unknown[]) => logError(...a) } }));
const noteSessionsCutOff = jest.fn();
const revokeMcpGrants = jest.fn();
jest.mock("@/lib/auth/sessionCutOff", () => ({
  noteSessionsCutOff: (...a: unknown[]) => noteSessionsCutOff(...a),
  revokeMcpGrants: (...a: unknown[]) => revokeMcpGrants(...a),
}));

import { dropUnprovenPassword, revokeUnprovenAccessElsewhere, unprovenAccessCleanup } from "@/lib/auth/unprovenPassword";

beforeEach(() => {
  updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
  webhookUpdateMany.mockReset().mockResolvedValue({ modifiedCount: 0 });
  apiKeyUpdateMany.mockReset().mockResolvedValue({ modifiedCount: 0 });
  pushDeleteMany.mockReset().mockResolvedValue({ deletedCount: 0 });
  logActivity.mockClear();
  logError.mockClear();
  noteSessionsCutOff.mockClear();
  revokeMcpGrants.mockReset().mockResolvedValue(undefined);
});

const drop = () => dropUnprovenPassword("user-1", { provider: "email-otp", role: "job_seeker" });

it("removes the password in one conditional write", async () => {
  expect(await drop()).toBe(true);

  const [filter, update] = updateOne.mock.calls[0];
  // Only an account nobody has proved the mailbox for, that has a password.
  // A temporary password is NOT spared: an employer who adds a colleague's
  // address is shown that password, so it is as unproven as any other.
  expect(filter).toEqual({
    _id: "user-1",
    isEmailVerified: { $ne: true },
    passwordHash: { $exists: true, $nin: [null, ""] },
  });
  expect(update.$unset).toMatchObject({ passwordHash: "", tempPasswordIssuedAt: "" });
});

it("ends the sessions and grants that password opened", async () => {
  const before = Date.now();
  await drop();

  const { $set } = updateOne.mock.calls[0][1];
  // sessionsValidAfter: the jwt callback signs out every session signed in
  // before it. passwordChangedAt: MCP grants are cut on it.
  expect($set.sessionsValidAfter).toBeInstanceOf(Date);
  expect($set.sessionsValidAfter.getTime()).toBeGreaterThanOrEqual(before);
  expect($set.passwordChangedAt).toEqual($set.sessionsValidAfter);
  // This server applies it on the very next request (lib/auth/sessionCutOff.ts).
  expect(noteSessionsCutOff).toHaveBeenCalledWith("user-1", $set.sessionsValidAfter);
});

it("clears what the password could have left on the account to get back in", async () => {
  await drop();

  const { $unset } = updateOne.mock.calls[0][1];
  // A pending e-mail change is confirmed from the NEW address: left in place,
  // it would hand the account to that address.
  expect($unset).toMatchObject({ pendingEmail: "", emailChangeToken: "", emailChangeExpires: "" });
  // The calendar feed link works without signing in.
  expect($unset).toMatchObject({ calendarFeedToken: "" });
  // WhatsApp sends go to the number a START came from: the stranger's phone.
  // The START code goes too: the stranger saw it and could text it again from
  // that number (still the profile phone) and be verified once more.
  expect($unset).toMatchObject({ "whatsapp.verifiedNumber": "", "whatsapp.waId": "", "whatsapp.startCode": "" });
});

it("switches off what lives outside the account and still reaches the stranger", async () => {
  await drop();

  // Webhooks post events to a URL of their creator's choosing.
  expect(webhookUpdateMany).toHaveBeenCalledWith({ createdBy: "user-1", isActive: true }, { $set: { isActive: false } });
  // API keys the account minted.
  expect(apiKeyUpdateMany).toHaveBeenCalledWith({ createdBy: "user-1", isActive: true }, { $set: { isActive: false } });
  // Browser push goes to the stranger's browser.
  expect(pushDeleteMany).toHaveBeenCalledWith({ userId: "user-1" });
  // An MCP connector (ChatGPT / Claude) the stranger approved.
  expect(revokeMcpGrants).toHaveBeenCalledWith("user-1");
});

it("leaves the lockout counters of the old password behind", async () => {
  await drop();
  expect(updateOne.mock.calls[0][1].$set).toMatchObject({ failedLoginAttempts: 0, lockUntil: null });
});

it("records it, without the address or any secret", async () => {
  await dropUnprovenPassword("user-1", { provider: "firebase-google", role: "employer" });
  expect(logActivity).toHaveBeenCalledWith({
    actorId: "user-1",
    actorRole: "employer",
    action: "auth.unproven_password_removed",
    resource: "auth",
    resourceId: "user-1",
    meta: { provider: "firebase-google" },
  });
});

it("says so, and touches nothing else, when there was nothing to remove", async () => {
  // Verified already, or no password: the filter matches no document.
  updateOne.mockResolvedValue({ modifiedCount: 0 });
  expect(await dropUnprovenPassword("user-1", { provider: "linkedin", role: "job_seeker" })).toBe(false);
  expect(webhookUpdateMany).not.toHaveBeenCalled();
  expect(pushDeleteMany).not.toHaveBeenCalled();
  expect(logActivity).not.toHaveBeenCalled();
  expect(noteSessionsCutOff).not.toHaveBeenCalled();
});

it("still lets the owner in when something outside the account could not be switched off", async () => {
  // The password is already gone; refusing the sign-in now would only lock
  // the owner out of an account with no password. One failure does not stop
  // the others.
  webhookUpdateMany.mockRejectedValue(new Error("db down"));
  await expect(drop()).resolves.toBe(true);
  expect(apiKeyUpdateMany).toHaveBeenCalled();
  expect(pushDeleteMany).toHaveBeenCalled();
  expect(logError).toHaveBeenCalled();
});

it("hands the same account write to a route that sets a new password in it", () => {
  // reset-password writes the new password and this cleanup in ONE update, so
  // a failure cannot leave the owner with neither.
  const now = new Date("2026-11-12T12:00:00Z");
  const cleanup = unprovenAccessCleanup(now);
  expect(cleanup.$set).toEqual({ passwordChangedAt: now, sessionsValidAfter: now, failedLoginAttempts: 0, lockUntil: null });
  expect(cleanup.$unset).not.toHaveProperty("passwordHash");
  expect(cleanup.$unset).toMatchObject({ pendingEmail: "", calendarFeedToken: "", "whatsapp.verifiedNumber": "" });
});

it("can run the outside clean-up on its own, and never throws", async () => {
  pushDeleteMany.mockRejectedValue(new Error("db down"));
  await expect(revokeUnprovenAccessElsewhere("user-1")).resolves.toBeUndefined();
  expect(webhookUpdateMany).toHaveBeenCalled();
});
