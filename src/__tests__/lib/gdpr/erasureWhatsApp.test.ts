/**
 * @jest-environment node
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/gdpr/redactMessages", () => ({ redactUserMessages: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/cv/cvDocuments", () => ({ deleteCvRecordsOfSeeker: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/storage/spaces", () => ({ deleteFile: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
// The job seeker's own deletion (api/job-seekers/account) runs as the signed-in seeker.
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: unknown, ctx: unknown) => Promise<Response>) => (req: unknown) => handler(req, { userId: "64b000000000000000000001", role: "job_seeker", locale: "en" }),
}));
const userUpdate = jest.fn().mockResolvedValue(undefined);
const userUpdateOne = jest.fn((..._a: unknown[]) => Promise.resolve({ modifiedCount: 1 }));
// What `User.findById(id).select(...).lean()` resolves to; each test sets the subject it needs.
let subject: { phone?: string | null; whatsapp?: { waId?: string } } | null = null;
const userFindById = jest.fn((..._a: unknown[]) => ({ select: () => ({ lean: async () => subject }) }));
jest.mock("@/models/User", () => {
  const model = {
    findById: (...a: unknown[]) => userFindById(...a),
    findByIdAndUpdate: (...a: unknown[]) => userUpdate(...a),
    updateOne: (...a: unknown[]) => userUpdateOne(...a),
  };
  return { __esModule: true, default: model, User: model };
});

/** A STOP-list entry as stored; times can be junk in a hand-edited document. */
type Entry = { number: string; optedOutAt?: unknown; liftedAt?: unknown };
/** The STOP list, in memory. The model's own helpers run; only the collection's deleteMany is replaced (matches()). */
let entries: Entry[] = [];
const BSON_RANK = (v: unknown) => (v === undefined || v === null ? 0 : typeof v === "number" ? 1 : typeof v === "string" ? 2 : v instanceof Date ? 9 : 3);
/** MongoDB's ordering for the values these entries hold: missing/null < numbers < strings < dates; dates by time. */
const bsonCompare = (a: unknown, b: unknown) =>
  BSON_RANK(a) !== BSON_RANK(b) ? BSON_RANK(a) - BSON_RANK(b) : a instanceof Date && b instanceof Date ? a.getTime() - b.getTime() : 0;
/** Evaluates the operators a STOP-list filter uses, as MongoDB does: $in, null, $type, $or, $expr with $lt/$gt. */
function matches(doc: Entry, filter: Record<string, unknown>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === "$or") return (cond as Record<string, unknown>[]).some((c) => matches(doc, c));
    if (key === "$expr") {
      const [op, [a, b]] = Object.entries(cond as Record<string, [string, string]>)[0];
      const diff = bsonCompare(doc[a.slice(1) as keyof Entry], doc[b.slice(1) as keyof Entry]);
      if (op === "$lt") return diff < 0;
      if (op === "$gt") return diff > 0;
      throw new Error(`unsupported $expr ${op}`);
    }
    const value = doc[key as keyof Entry];
    if (cond === null) return value === null || value === undefined;
    if (typeof cond === "object" && cond && "$in" in cond) return (cond as { $in: unknown[] }).$in.includes(value);
    if (typeof cond === "object" && cond && "$type" in cond) {
      if ((cond as { $type: string }).$type !== "date") throw new Error("unsupported $type");
      return value instanceof Date;
    }
    if (typeof cond === "object" && cond) throw new Error(`unsupported condition on ${key}`);
    return value === cond;
  });
}
const suppressionDeleteMany = jest.fn(async (filter: Record<string, unknown>) => {
  const before = entries.length;
  entries = entries.filter((e) => !matches(e, filter));
  return { deletedCount: before - entries.length };
});
jest.mock("@/models/WhatsAppSuppression", () => {
  const actual = jest.requireActual("@/models/WhatsAppSuppression");
  Object.assign(actual.WhatsAppSuppression, { deleteMany: (...a: unknown[]) => suppressionDeleteMany(...(a as [Record<string, unknown>])) });
  return actual;
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOneAndUpdate: () => ({ select: () => ({ lean: async () => null }) }) },
}));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: () => ({ lean: async () => [] }), updateMany: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { deleteMany: jest.fn().mockResolvedValue(undefined) } }));
const waDeleteMany = jest.fn((..._a: unknown[]) => Promise.resolve({ deletedCount: 3 }));
jest.mock("@/models/WhatsAppMessageLog", () => ({ __esModule: true, default: { deleteMany: (...a: unknown[]) => waDeleteMany(...a) } }));

import { NextRequest } from "next/server";
import { eraseUserPersonalData, eraseWhatsAppData } from "@/lib/gdpr/erasure";
import { isSuppressionInForce, liftedSuppressionFilter } from "@/models/WhatsAppSuppression";

const USER_ID = "64b000000000000000000001";

/** The `to` filters passed to WhatsAppMessageLog.deleteMany (the `{ userId }` call is excluded). */
function toFilters(): { to: { $in: string[] } }[] {
  return waDeleteMany.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((f) => "to" in f) as { to: { $in: string[] } }[];
}

describe("GDPR erasure covers WhatsApp data", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subject = null;
    entries = [];
  });

  it("deletes the user's WhatsApp message log and clears the whatsapp subdocument", async () => {
    await eraseUserPersonalData(USER_ID);
    expect(waDeleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: USER_ID }, { $unset: { whatsapp: 1 } });
    const update = userUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(update.phone).toBeNull();
  });

  describe("log rows that carry the subject's number under another user's id", () => {
    it("deletes by the normalised number, the waId form and the raw phone, without duplicates", async () => {
      // Stored without the plus: normalised, waId and raw are three spellings of two distinct strings.
      subject = { phone: "971501234567", whatsapp: { waId: "971501234567" } };
      await eraseUserPersonalData(USER_ID);
      expect(userFindById).toHaveBeenCalledWith(USER_ID);
      const filters = toFilters();
      expect(filters).toHaveLength(1);
      expect([...filters[0].to.$in].sort()).toEqual(["+971501234567", "971501234567"]);
    });

    it("also matches a waId that differs from the stored phone", async () => {
      subject = { phone: "+971501234567", whatsapp: { waId: "447911123456" } };
      await eraseUserPersonalData(USER_ID);
      // The raw phone equals the normalised form here, so it is not repeated.
      expect([...toFilters()[0].to.$in].sort()).toEqual(["+447911123456", "+971501234567"]);
    });

    it("keeps the raw input of a phone that is not a valid international number", async () => {
      // send.ts leaves the raw input on invalid_phone skipped rows.
      subject = { phone: "0501234567" };
      await eraseUserPersonalData(USER_ID);
      expect(toFilters()[0].to.$in).toEqual(["0501234567"]);
    });

    it("does not crash on a phone stored as something other than a string, and still matches by waId", async () => {
      // A legacy or hand-edited document: `phone` as a number would throw on .trim().
      subject = { phone: 971501234567 as unknown as string, whatsapp: { waId: "971501234567" } };
      await expect(eraseUserPersonalData(USER_ID)).resolves.toEqual(expect.objectContaining({ anonymizedEmail: expect.any(String) }));
      expect(toFilters()[0].to.$in).toEqual(["+971501234567"]);
    });

    it("matches by waId alone when the phone was already cleared", async () => {
      subject = { phone: null, whatsapp: { waId: "971501234567" } };
      await eraseUserPersonalData(USER_ID);
      expect(toFilters()[0].to.$in).toEqual(["+971501234567"]);
    });

    it.each([
      ["no phone and no waId", {}],
      ["an empty phone and no waId", { phone: "  ", whatsapp: {} }],
      ["a user that no longer exists", null],
    ])("does not delete by number for %s", async (_label, who) => {
      subject = who;
      await eraseUserPersonalData(USER_ID);
      expect(toFilters()).toHaveLength(0);
      expect(waDeleteMany).toHaveBeenCalledTimes(1);
      expect(waDeleteMany).toHaveBeenCalledWith({ userId: USER_ID });
      expect(userUpdate).toHaveBeenCalledTimes(1);
    });

    it("reads the number and deletes by it before the account is anonymised", async () => {
      subject = { phone: "+971501234567" };
      await eraseUserPersonalData(USER_ID);
      const toCall = waDeleteMany.mock.calls.findIndex((c) => "to" in (c[0] as object));
      expect(toCall).toBeGreaterThanOrEqual(0);
      const read = userFindById.mock.invocationCallOrder[0];
      const deleteByNumber = waDeleteMany.mock.invocationCallOrder[toCall];
      const anonymise = userUpdate.mock.invocationCallOrder[0];
      expect(read).toBeLessThan(deleteByNumber);
      expect(deleteByNumber).toBeLessThan(anonymise);
    });

    it("leaves the account untouched when the delete by number fails, so a retry still has the number", async () => {
      subject = { phone: "+971501234567" };
      waDeleteMany.mockImplementationOnce(() => Promise.reject(new Error("db down")));
      await expect(eraseUserPersonalData(USER_ID)).rejects.toThrow("db down");
      expect(userUpdate).not.toHaveBeenCalled();
      expect(userUpdateOne).not.toHaveBeenCalled();
    });
  });
});

// The WhatsApp part, shared with the job seeker's own account deletion
// (api/job-seekers/account) so the two cannot drift apart.
describe("eraseWhatsAppData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    subject = { phone: "+971501234567", whatsapp: { waId: "447911123456" } };
    entries = [];
  });

  it("deletes the log rows by the candidate numbers and by userId, then unsets the whole whatsapp subdocument", async () => {
    await eraseWhatsAppData(USER_ID);
    expect([...toFilters()[0].to.$in].sort()).toEqual(["+447911123456", "+971501234567"]);
    expect(waDeleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    expect(userUpdateOne).toHaveBeenCalledWith({ _id: USER_ID }, { $unset: { whatsapp: 1 } });
    // The number is read, and the rows go, before the state that names it is cleared.
    const lastDelete = Math.max(...waDeleteMany.mock.invocationCallOrder);
    expect(userFindById.mock.invocationCallOrder[0]).toBeLessThan(waDeleteMany.mock.invocationCallOrder[0]);
    expect(lastDelete).toBeLessThan(userUpdateOne.mock.invocationCallOrder[0]);
  });

  it("keeps the number's suppression entry while its STOP is in force: a STOP outlives the account", async () => {
    entries = [{ number: "+971501234567", optedOutAt: T2, liftedAt: T1 }];
    await eraseWhatsAppData(USER_ID);
    expect(entries).toEqual([{ number: "+971501234567", optedOutAt: T2, liftedAt: T1 }]);
  });

  it("leaves the whatsapp state in place when a delete fails, so a retry still finds the number", async () => {
    waDeleteMany.mockImplementationOnce(() => Promise.reject(new Error("db down")));
    await expect(eraseWhatsAppData(USER_ID)).rejects.toThrow("db down");
    expect(userUpdateOne).not.toHaveBeenCalled();
  });
});

// J1: since a START keeps the STOP-list entry (with `liftedAt`) instead of deleting it, an entry can hold a number
// and suppress nothing. Erasure must not keep the erased person's number for no purpose: it deletes their entries
// that are not in force, by the same rule every send reads (isSuppressionInForce), and keeps a STOP still standing.
const T1 = new Date("2026-10-01T09:00:00Z");
const T2 = new Date("2026-10-02T09:00:00Z");

describe("the STOP list after an erasure", () => {
  /** The subject's numbers: the profile phone and the wa_id. One lifted, one standing, one tie; plus someone else's. */
  const seed = () => {
    subject = { phone: "+971501234567", whatsapp: { waId: "447911123456" } };
    entries = [
      { number: "+971501234567", optedOutAt: T1, liftedAt: T2 },
      { number: "+447911123456", optedOutAt: T2, liftedAt: T1 },
      { number: "+966501234567", optedOutAt: T1, liftedAt: T2 },
    ];
  };
  /** What must remain: the standing STOP of the subject's wa_id, and the other person's entry, untouched. */
  const REMAINING = [
    { number: "+447911123456", optedOutAt: T2, liftedAt: T1 },
    { number: "+966501234567", optedOutAt: T1, liftedAt: T2 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    seed();
  });

  it("the shared helper deletes the subject's lifted entries and keeps a STOP in force", async () => {
    await eraseWhatsAppData(USER_ID);
    expect(entries).toEqual(REMAINING);
    // Only the subject's numbers are looked at.
    expect(suppressionDeleteMany).toHaveBeenCalledTimes(1);
    expect([...(suppressionDeleteMany.mock.calls[0][0] as { number: { $in: string[] } }).number.$in].sort()).toEqual(["+447911123456", "+971501234567"]);
  });

  it("does so on the admin erasure path (eraseUserPersonalData)", async () => {
    await eraseUserPersonalData(USER_ID);
    expect(entries).toEqual(REMAINING);
  });

  it("does so on the job seeker's own deletion (DELETE /api/job-seekers/account)", async () => {
    const { DELETE } = await import("@/app/api/job-seekers/account/route");
    const res = await DELETE(new NextRequest("http://localhost/api/job-seekers/account", { method: "DELETE" }), { params: Promise.resolve({}) } as never);
    expect(res.status).toBe(200);
    expect(entries).toEqual(REMAINING);
  });

  it("keeps a STOP and a START in the same second: the STOP wins the tie, as everywhere else", async () => {
    entries = [{ number: "+971501234567", optedOutAt: T1, liftedAt: T1 }];
    await eraseWhatsAppData(USER_ID);
    expect(entries).toHaveLength(1);
  });

  it("deletes before the whatsapp subdocument is cleared, and a failed delete leaves the state for a retry", async () => {
    await eraseWhatsAppData(USER_ID);
    expect(suppressionDeleteMany.mock.invocationCallOrder[0]).toBeLessThan(userUpdateOne.mock.invocationCallOrder[0]);
    jest.clearAllMocks();
    suppressionDeleteMany.mockRejectedValueOnce(new Error("db down"));
    await expect(eraseWhatsAppData(USER_ID)).rejects.toThrow("db down");
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it("does not touch the list for a subject with no number", async () => {
    subject = {};
    await eraseWhatsAppData(USER_ID);
    expect(suppressionDeleteMany).not.toHaveBeenCalled();
  });

  it("the query form of the rule deletes exactly the entries isSuppressionInForce says are not in force", () => {
    const table: Entry[] = [
      { number: "lifted", optedOutAt: T1, liftedAt: T2 },
      { number: "standing STOP, older START", optedOutAt: T2, liftedAt: T1 },
      { number: "tie", optedOutAt: T1, liftedAt: T1 },
      { number: "never lifted", optedOutAt: T1 },
      { number: "lifted, null STOP", optedOutAt: null, liftedAt: T1 },
      { number: "no STOP at all" },
      // Unreadable times count as in force (the rule), so the entry stays.
      { number: "junk START time", optedOutAt: T1, liftedAt: "not a date" },
      { number: "junk STOP time", optedOutAt: "not a date", liftedAt: T2 },
    ];
    for (const entry of table) {
      expect([entry.number, matches(entry, liftedSuppressionFilter)]).toEqual([entry.number, !isSuppressionInForce(entry as never)]);
    }
  });
});
