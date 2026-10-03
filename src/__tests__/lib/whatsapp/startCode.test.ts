/**
 * @jest-environment node
 *
 * The personal START code (owner decision 2026-10-03): the "Message us on
 * WhatsApp" button types `START <code>`, and that START verifies only the
 * account holding the code. Six characters nobody can misread, made with
 * crypto.randomInt, stored once per account, unique across accounts.
 */
export {};

jest.mock("crypto", () => {
  const actual = jest.requireActual("crypto");
  return { ...actual, randomInt: jest.fn((...a: unknown[]) => (actual.randomInt as (...x: unknown[]) => number)(...a)) };
});
jest.mock("@/lib/communications/whatsapp/config", () => ({ isWhatsAppEnabled: () => true }));
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({ getPhoneNumberInfo: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));

/** The account as the database holds it; the User mock below applies the helper's writes to it as MongoDB would. */
let account: { _id: string; whatsapp?: { startCode?: string } } | null;
/** Codes other accounts already hold: the unique index refuses them with E11000. */
let taken: Set<string>;
const duplicateKey = () => Object.assign(new Error("E11000 duplicate key error collection: users index: unique_whatsapp_start_code"), { code: 11000 });
const findOneAndUpdate = jest.fn((filter: { _id: string; "whatsapp.startCode"?: null }, update: { $set: Record<string, string> }) => ({
  select: () => ({
    lean: async () => {
      // Matches only while the account has no code (`"whatsapp.startCode": null` matches a missing field).
      if (!account || account._id !== filter._id || account.whatsapp?.startCode != null) return null;
      const code = update.$set["whatsapp.startCode"];
      if (taken.has(code)) throw duplicateKey();
      account = { ...account, whatsapp: { ...account.whatsapp, startCode: code } };
      return account;
    },
  }),
}));
const findById = jest.fn((id: string) => ({ select: () => ({ lean: async () => (account && account._id === id ? account : null) }) }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...(a as Parameters<typeof findOneAndUpdate>)),
    findById: (...a: unknown[]) => findById(...(a as Parameters<typeof findById>)),
  },
}));

import { randomInt } from "crypto";
import logger from "@/lib/logger";
import { START_CODE_ALPHABET, START_CODE_LENGTH, generateStartCode, isStartCode } from "@/lib/communications/whatsapp/startCode";
import { ensureStartCode } from "@/lib/communications/whatsapp/startLink";

const USER_ID = "64d000000000000000000009";

beforeEach(() => {
  jest.clearAllMocks();
  account = { _id: USER_ID };
  taken = new Set();
});

describe("the START code alphabet and generator", () => {
  it("uses A-Z and 2-9 without the look-alikes O, I, L, 0 and 1", () => {
    expect(START_CODE_ALPHABET).toBe("ABCDEFGHJKMNPQRSTUVWXYZ23456789");
    expect(START_CODE_ALPHABET).toHaveLength(31);
    for (const lookAlike of ["O", "I", "L", "0", "1"]) expect(START_CODE_ALPHABET).not.toContain(lookAlike);
  });

  it("makes 6 characters, each drawn from the alphabet with crypto.randomInt", () => {
    expect(START_CODE_LENGTH).toBe(6);
    const code = generateStartCode();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/);
    expect(randomInt).toHaveBeenCalledTimes(6);
    for (const call of (randomInt as unknown as jest.Mock).mock.calls) expect(call).toEqual([31]);
  });

  it("maps each random index to its character in the alphabet", () => {
    (randomInt as unknown as jest.Mock).mockReturnValueOnce(0).mockReturnValueOnce(8).mockReturnValueOnce(10).mockReturnValueOnce(12).mockReturnValueOnce(23).mockReturnValueOnce(30);
    expect(generateStartCode()).toBe("AJMP29");
  });

  it("only ever produces valid codes, and reaches every character", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      const code = generateStartCode();
      expect(isStartCode(code)).toBe(true);
      for (const ch of code) seen.add(ch);
    }
    expect([...seen].sort().join("")).toBe([...START_CODE_ALPHABET].sort().join(""));
  });

  it("isStartCode accepts exactly 6 upper-case characters of the alphabet", () => {
    expect(isStartCode("K7P4QX")).toBe(true);
    for (const bad of ["k7p4qx", "K7P4Q", "K7P4QXX", "K7P4Q0", "K7P4QO", "K7P4QI", "K7P4QL", "K7P4Q1", "K7P 4Q", "", "K7P4Q!"]) {
      expect([bad, isStartCode(bad)]).toEqual([bad, false]);
    }
  });
});

describe("ensureStartCode", () => {
  it("creates the code once, then returns the same one", async () => {
    const first = await ensureStartCode(USER_ID);
    expect(isStartCode(first ?? "")).toBe(true);
    expect(account?.whatsapp?.startCode).toBe(first);
    const second = await ensureStartCode(USER_ID);
    expect(second).toBe(first);
    // One write set it; the second call's write matched nothing (the code is there), and it read the stored one.
    expect(randomInt).toHaveBeenCalledTimes(12);
    expect(account?.whatsapp?.startCode).toBe(first);
  });

  it("sets the code only while the account has none, in one atomic write", async () => {
    await ensureStartCode(USER_ID);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0] as unknown as [unknown, { $set: Record<string, string> }, unknown];
    expect(filter).toEqual({ _id: USER_ID, "whatsapp.startCode": null });
    expect(Object.keys(update)).toEqual(["$set"]);
    expect(Object.keys(update.$set)).toEqual(["whatsapp.startCode"]);
    expect(options).toEqual({ returnDocument: "after" });
  });

  it("returns the code a concurrent page load stored first", async () => {
    account = { _id: USER_ID, whatsapp: { startCode: "K7P4QX" } };
    expect(await ensureStartCode(USER_ID)).toBe("K7P4QX");
    expect(account?.whatsapp?.startCode).toBe("K7P4QX");
  });

  it("retries with a new code when another account already holds the one it drew", async () => {
    (randomInt as unknown as jest.Mock).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(0);
    taken.add("AAAAAA");
    const code = await ensureStartCode(USER_ID);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect((findOneAndUpdate.mock.calls[0] as unknown as [unknown, { $set: Record<string, string> }])[1].$set["whatsapp.startCode"]).toBe("AAAAAA");
    expect(code).not.toBe("AAAAAA");
    expect(isStartCode(code ?? "")).toBe(true);
    expect(account?.whatsapp?.startCode).toBe(code);
  });

  it("gives up after a few duplicates in a row with no code, never throwing", async () => {
    findOneAndUpdate.mockImplementation(() => ({ select: () => ({ lean: async () => Promise.reject(duplicateKey()) }) }));
    await expect(ensureStartCode(USER_ID)).resolves.toBeNull();
    expect(findOneAndUpdate.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(findOneAndUpdate.mock.calls.length).toBeLessThanOrEqual(10);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    findOneAndUpdate.mockReset();
  });

  it("answers null on any other database error, never throwing into the GET, and logs no code", async () => {
    findOneAndUpdate.mockImplementationOnce(() => ({ select: () => ({ lean: async () => Promise.reject(Object.assign(new Error("write blocked"), { name: "MongoServerError", code: 8000 })) }) }));
    await expect(ensureStartCode(USER_ID)).resolves.toBeNull();
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls[0])).not.toMatch(/write blocked/);
  });

  it("answers null for an account that does not exist", async () => {
    account = null;
    expect(await ensureStartCode(USER_ID)).toBeNull();
  });
});
