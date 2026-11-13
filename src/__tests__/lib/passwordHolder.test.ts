/**
 * @jest-environment node
 *
 * An emailed link proves who reads the mailbox, not who set the account's
 * password. Anyone can register someone else's address with a password of
 * their own; the "confirm your email" mail then goes to the real owner, and one
 * click used to leave a verified account with the stranger's password on it.
 *
 * `checkPasswordHolder` lets a link that marks an address confirmed finish only
 * for the person who holds the password: a session of that same account, or the
 * password typed on the page.
 */
let session: unknown = null;
jest.mock("@/lib/auth/config", () => ({ __esModule: true, auth: jest.fn(async () => session) }));
const compare = jest.fn(async (..._a: unknown[]) => true);
jest.mock("bcryptjs", () => ({ __esModule: true, default: { compare: (...a: unknown[]) => compare(...a) } }));
let allowed = true;
const checkRateLimit = jest.fn(async (..._a: unknown[]) => ({ allowed, resetAt: Date.now() + 1000 }));
jest.mock("@/lib/security/rateLimit", () => ({ __esModule: true, checkRateLimit: (...a: unknown[]) => checkRateLimit(...a) }));

import { checkPasswordHolder } from "@/lib/auth/passwordHolder";

const account = { _id: { toString: () => "user-1" }, passwordHash: "stored-hash" };

beforeEach(() => {
  session = null;
  allowed = true;
  compare.mockReset().mockResolvedValue(true);
  checkRateLimit.mockClear();
});

it("lets the account's own session through without a password", async () => {
  session = { user: { id: "user-1" } };
  await expect(checkPasswordHolder(account, undefined)).resolves.toEqual({ ok: true });
  expect(compare).not.toHaveBeenCalled();
});

it("asks for the password with no session, without counting it as a try", async () => {
  await expect(checkPasswordHolder(account, undefined)).resolves.toMatchObject({
    ok: false,
    status: 401,
    code: "PASSWORD_REQUIRED",
  });
  expect(checkRateLimit).not.toHaveBeenCalled();
});

it("asks for it when someone else is signed in on this browser", async () => {
  session = { user: { id: "someone-else" } };
  await expect(checkPasswordHolder(account, undefined)).resolves.toMatchObject({ ok: false, code: "PASSWORD_REQUIRED" });
});

it("does not count a half-finished two-factor sign-in as a session", async () => {
  session = { user: { pending2fa: true, pending2faUserId: "user-1" } };
  await expect(checkPasswordHolder(account, undefined)).resolves.toMatchObject({ ok: false, code: "PASSWORD_REQUIRED" });
});

it("accepts the right password, checked against the stored hash", async () => {
  await expect(checkPasswordHolder(account, "Str0ng!Passw0rd")).resolves.toEqual({ ok: true });
  expect(compare).toHaveBeenCalledWith("Str0ng!Passw0rd", "stored-hash");
});

it("refuses a wrong password", async () => {
  compare.mockResolvedValue(false);
  await expect(checkPasswordHolder(account, "guess")).resolves.toMatchObject({ ok: false, status: 401, code: "WRONG_PASSWORD" });
});

it("limits password tries per account, and fails closed", async () => {
  await checkPasswordHolder(account, "guess");
  const [key, options] = checkRateLimit.mock.calls[0] as [string, { failClosed?: boolean }];
  expect(key).toContain("user-1");
  expect(options.failClosed).toBe(true);

  allowed = false;
  compare.mockClear();
  await expect(checkPasswordHolder(account, "guess")).resolves.toMatchObject({ ok: false, status: 429, code: "TOO_MANY_ATTEMPTS" });
  expect(compare).not.toHaveBeenCalled();
});

it("asks nothing of an account that has no password: there is none to protect", async () => {
  await expect(checkPasswordHolder({ _id: account._id, passwordHash: undefined }, undefined)).resolves.toEqual({ ok: true });
  await expect(checkPasswordHolder({ _id: account._id, passwordHash: "" }, undefined)).resolves.toEqual({ ok: true });
});

it("refuses the password while the account is locked out from failed logins", async () => {
  // Otherwise the mailbox's reader gets password tries a locked account denies.
  const locked = { ...account, lockUntil: new Date(Date.now() + 10 * 60_000) };
  await expect(checkPasswordHolder(locked, "guess")).resolves.toMatchObject({ ok: false, status: 429, code: "TOO_MANY_ATTEMPTS" });
  expect(compare).not.toHaveBeenCalled();

  const lapsed = { ...account, lockUntil: new Date(Date.now() - 1000) };
  await expect(checkPasswordHolder(lapsed, "Str0ng!Passw0rd")).resolves.toEqual({ ok: true });
});
