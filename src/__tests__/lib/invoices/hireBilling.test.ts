/**
 * @jest-environment node
 */

const invoiceFindLean = jest.fn();
const invoiceFindOneLean = jest.fn();
const invoiceFind = jest.fn((..._args: unknown[]) => ({ select: () => ({ lean: invoiceFindLean }) }));
const invoiceFindOne = jest.fn((..._args: unknown[]) => ({ select: () => ({ lean: invoiceFindOneLean }) }));

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => invoiceFind(...args),
    findOne: (...args: unknown[]) => invoiceFindOne(...args),
  },
}));

import { checkHireBilling, findBilledPlacements } from "@/lib/invoices/hireBilling";
import { isFeeLine, linkLinePlacements } from "@/lib/invoices/linePlacements";

const JOB = "507f1f77bcf86cd799439011";
const HIRE_A = "507f1f77bcf86cd7994390a1";
const HIRE_B = "507f1f77bcf86cd7994390b2";

beforeEach(() => {
  jest.clearAllMocks();
  invoiceFindLean.mockResolvedValue([]);
  invoiceFindOneLean.mockResolvedValue(null);
});

describe("findBilledPlacements", () => {
  it("maps each already-billed hire to its open invoice number", async () => {
    invoiceFindLean.mockResolvedValue([
      { invoiceNumber: "INV-1", lineItems: [{ placementId: HIRE_A }, { placementId: "507f1f77bcf86cd7994390ff" }] },
    ]);
    const billed = await findBilledPlacements([HIRE_A, HIRE_B]);
    expect([...billed.entries()]).toEqual([[HIRE_A, "INV-1"]]);
    const filter = invoiceFind.mock.calls[0][0] as { status: { $nin: string[] } };
    expect(filter.status.$nin).toEqual(expect.arrayContaining(["void", "cancelled", "refunded", "credit_note"]));
  });

  it("skips the query when no valid ids are given", async () => {
    expect((await findBilledPlacements(["not-an-id"])).size).toBe(0);
    expect(invoiceFind).not.toHaveBeenCalled();
  });
});

describe("checkHireBilling", () => {
  it("allows a second invoice on the same job when every fee line names an unbilled hire", async () => {
    const conflict = await checkHireBilling(JOB, [{ placementId: HIRE_A }, { placementId: HIRE_B }, { chargeType: "other" }]);
    expect(conflict).toBeNull();
    // Only the unnamed-fee blocker is looked up; no "any open invoice" check.
    expect(invoiceFindOne).toHaveBeenCalledTimes(1);
  });

  it("rejects the same hire on two lines", async () => {
    const conflict = await checkHireBilling(JOB, [{ placementId: HIRE_A }, { placementId: HIRE_A }]);
    expect(conflict).toEqual(expect.objectContaining({ kind: "repeated_hire", status: 400 }));
  });

  it("rejects a hire already billed on another open invoice", async () => {
    invoiceFindLean.mockResolvedValue([{ invoiceNumber: "INV-9", lineItems: [{ placementId: HIRE_A }] }]);
    const conflict = await checkHireBilling(JOB, [{ placementId: HIRE_A }]);
    expect(conflict).toEqual(expect.objectContaining({ kind: "hire_already_billed", status: 409, invoiceNumber: "INV-9", placementIds: [HIRE_A] }));
    expect(conflict?.error).toContain("INV-9");
  });

  it("blocks any new invoice while an open invoice on the job bills an unnamed fee", async () => {
    invoiceFindOneLean.mockResolvedValueOnce({ _id: "x", invoiceNumber: "INV-OLD", status: "issued" });
    const conflict = await checkHireBilling(JOB, [{ placementId: HIRE_A }]);
    expect(conflict).toEqual(expect.objectContaining({ kind: "job_has_unnamed_fee", invoiceNumber: "INV-OLD" }));
  });

  it("keeps one open invoice per job for an invoice that bills an unnamed fee", async () => {
    invoiceFindOneLean
      .mockResolvedValueOnce(null) // no open invoice with an unnamed fee
      .mockResolvedValueOnce({ _id: "y", invoiceNumber: "INV-LINKED", status: "issued" }); // but one is open
    const conflict = await checkHireBilling(JOB, [{ description: "Recruitment fee" } as { placementId?: string }]);
    expect(conflict).toEqual(expect.objectContaining({ kind: "job_has_unnamed_fee", invoiceNumber: "INV-LINKED" }));
  });

  it("does not treat an other charge as an unnamed fee", async () => {
    const conflict = await checkHireBilling(JOB, [{ placementId: HIRE_A }, { chargeType: "other" }]);
    expect(conflict).toBeNull();
    expect(invoiceFindOne).toHaveBeenCalledTimes(1);
  });
});

describe("linkLinePlacements with other charges", () => {
  const load = async () => [{ _id: HIRE_A, jobId: JOB }];

  it("links the single fee line to the job's only hire and leaves the other charge alone", async () => {
    const result = await linkLinePlacements(JOB, [{ chargeType: "other" as const }, {}], load);
    expect("lines" in result && result.lines).toEqual([{ chargeType: "other" }, { placementId: HIRE_A }]);
  });

  it("does not link when there are two fee lines", async () => {
    const result = await linkLinePlacements(JOB, [{}, {}], load);
    expect("lines" in result && result.lines).toEqual([{}, {}]);
  });

  it("treats a line without chargeType as a fee line", () => {
    expect(isFeeLine({})).toBe(true);
    expect(isFeeLine({ chargeType: "placement" })).toBe(true);
    expect(isFeeLine({ chargeType: "other" })).toBe(false);
  });
});
