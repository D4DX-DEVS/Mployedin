/**
 * @jest-environment node
 */
import WhatsAppSuppression, { isNumberSuppressed, isSuppressionInForce, liftSuppression, suppressNumber } from "@/models/WhatsAppSuppression";

const AT = new Date("2026-10-02T10:00:00Z");
const T1 = new Date("2026-10-02T09:00:00Z");
const T2 = new Date("2026-10-02T10:00:00Z");
const T3 = new Date("2026-10-02T11:00:00Z");

afterEach(() => jest.restoreAllMocks());

describe("WhatsAppSuppression schema", () => {
  it("keys one entry per number and records when and why", () => {
    expect(WhatsAppSuppression.schema.path("number").options.unique).toBe(true);
    expect(WhatsAppSuppression.schema.path("optedOutAt").instance).toBe("Date");
    expect(WhatsAppSuppression.schema.path("source").options.enum).toEqual(["stop_keyword", "admin"]);
    expect(WhatsAppSuppression.schema.options.timestamps).toBe(true);
  });

  it("keeps the time of the latest START on the entry instead of deleting it", () => {
    expect(WhatsAppSuppression.schema.path("liftedAt").instance).toBe("Date");
    expect(WhatsAppSuppression.schema.path("liftedAt").options.required).toBeFalsy();
  });
});

// One rule, read by every send (send.ts), the admin test send and the settings pages' status.
describe("isSuppressionInForce", () => {
  it("is false with no entry, or an entry with no STOP", () => {
    expect(isSuppressionInForce(null)).toBe(false);
    expect(isSuppressionInForce(undefined)).toBe(false);
    expect(isSuppressionInForce({ liftedAt: T2 })).toBe(false);
  });

  it("is true for a STOP no START has lifted", () => {
    expect(isSuppressionInForce({ optedOutAt: T1 })).toBe(true);
    expect(isSuppressionInForce({ optedOutAt: T1, liftedAt: null })).toBe(true);
  });

  it("is false once a START newer than the STOP lifted it", () => {
    expect(isSuppressionInForce({ optedOutAt: T1, liftedAt: T2 })).toBe(false);
  });

  it("is true again for a STOP newer than that START", () => {
    expect(isSuppressionInForce({ optedOutAt: T3, liftedAt: T2 })).toBe(true);
  });

  it("gives a STOP and a START in the same second to the STOP, as the account-level order guard does", () => {
    expect(isSuppressionInForce({ optedOutAt: T2, liftedAt: T2 })).toBe(true);
  });

  it("counts a date it cannot read as suppressed: a withdrawn consent fails as do not send", () => {
    expect(isSuppressionInForce({ optedOutAt: T1, liftedAt: "not a date" as unknown as Date })).toBe(true);
  });
});

describe("suppression helpers", () => {
  const findOneReturning = (entry: unknown) => {
    const select = jest.fn(() => ({ lean: async () => entry }));
    const findOne = jest.spyOn(WhatsAppSuppression, "findOne").mockReturnValue({ select } as never);
    return { findOne, select };
  };

  it("isNumberSuppressed reads the exact number's STOP and START times and applies the rule", async () => {
    const { findOne, select } = findOneReturning({ optedOutAt: T1 });
    expect(await isNumberSuppressed("+971501234567")).toBe(true);
    expect(findOne).toHaveBeenCalledWith({ number: "+971501234567" });
    expect(select).toHaveBeenCalledWith("optedOutAt liftedAt");
  });

  it("isNumberSuppressed is false for a number never stopped, and for one a newer START lifted", async () => {
    findOneReturning(null);
    expect(await isNumberSuppressed("+971501234568")).toBe(false);
    jest.restoreAllMocks();
    findOneReturning({ optedOutAt: T1, liftedAt: T2 });
    expect(await isNumberSuppressed("+971501234567")).toBe(false);
  });

  it("suppressNumber upserts, only moves the STOP time forward and never overwrites the source or the START time", async () => {
    const updateOne = jest.spyOn(WhatsAppSuppression, "updateOne").mockResolvedValue({} as never);
    await suppressNumber("+971501234567", AT, "stop_keyword");
    expect(updateOne).toHaveBeenCalledWith(
      { number: "+971501234567" },
      { $max: { optedOutAt: AT }, $setOnInsert: { source: "stop_keyword" } },
      { upsert: true },
    );
  });

  // C3: deleting the entry let an older STOP, redelivered after the START, re-insert it.
  it("liftSuppression keeps the entry and moves its START time forward, never deleting it", async () => {
    const updateOne = jest.spyOn(WhatsAppSuppression, "updateOne").mockResolvedValue({} as never);
    const deleteOne = jest.spyOn(WhatsAppSuppression, "deleteOne").mockResolvedValue({} as never);
    await liftSuppression("+971501234567", AT);
    expect(updateOne).toHaveBeenCalledWith({ number: "+971501234567" }, { $max: { liftedAt: AT } });
    expect(deleteOne).not.toHaveBeenCalled();
  });
});
