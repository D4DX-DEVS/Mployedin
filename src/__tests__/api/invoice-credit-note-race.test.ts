/**
 * @jest-environment node
 *
 * POST /api/invoices/[id]/credit-note read the refunded total, checked the new
 * amount against it, then wrote — so two credit notes issued at the same moment
 * both passed the check and together refunded more than the invoice was worth
 * (audit FUNC-011). The amount is now reserved with one conditional update;
 * only a reservation that still fits succeeds.
 *
 * The Invoice mock applies findOneAndUpdate's filter against shared state in a
 * single step, as MongoDB does for one document.
 */
import { NextRequest } from "next/server";

const INVOICE_ID = "650000000000000000000500";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, { userId: "650000000000000000000001", role: "admin", locale: "en" }, { id: INVOICE_ID }),
}));
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/integrations/webhookDispatcher", () => ({ dispatchWebhook: jest.fn() }));
let seq = 0;
jest.mock("@/lib/subscription/invoiceNumber", () => ({ generateInvoiceNumber: jest.fn(async () => `CN-${++seq}`) }));

interface Stored { _id: string; invoiceNumber: string; status: string; totalAmount: number; refundedAmount: number; currency: string }
let stored: Stored;
const created: Array<Record<string, unknown>> = [];
let failCreate = false;

const tick = () => new Promise((r) => setImmediate(r));

/** Evaluates the route's reservation filter: status not void/cancelled, refunded + amount ≤ total. */
function fits(filter: Record<string, unknown>, amount: number): boolean {
  const statusOk = !(filter.status as { $nin?: string[] } | undefined)?.$nin?.includes(stored.status);
  return statusOk && stored.refundedAmount + amount <= stored.totalAmount;
}

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(async () => {
      await tick(); // let a concurrent request read the same state
      return { ...stored, save: jest.fn() };
    }),
    findOneAndUpdate: jest.fn(async (filter: Record<string, unknown>, update: { $inc?: { refundedAmount: number }; $set?: Record<string, unknown> }) => {
      await tick();
      const amount = update.$inc?.refundedAmount ?? 0;
      if (amount > 0 && !fits(filter, amount)) return null;
      stored.refundedAmount += amount;
      if (update.$set) Object.assign(stored, update.$set);
      return { ...stored };
    }),
    updateOne: jest.fn(async (_filter: Record<string, unknown>, update: { $inc?: { refundedAmount: number }; $set?: Record<string, unknown> }) => {
      if (update.$inc) stored.refundedAmount += update.$inc.refundedAmount;
      if (update.$set) Object.assign(stored, update.$set);
      return { modifiedCount: 1 };
    }),
    create: jest.fn(async (doc: Record<string, unknown>) => {
      await tick();
      if (failCreate) throw new Error("E11000 duplicate key");
      const row = { _id: `cn_${created.length + 1}`, ...doc };
      created.push(row);
      return row;
    }),
  },
}));

import { POST as _POST } from "@/app/api/invoices/[id]/credit-note/route";
const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

const issue = (amount: number) =>
  POST(new NextRequest(`http://localhost/api/invoices/${INVOICE_ID}/credit-note`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amount, reason: "Duplicate charge" }),
  }));

beforeEach(() => {
  created.length = 0;
  failCreate = false;
  stored = { _id: INVOICE_ID, invoiceNumber: "INV-1", status: "paid", totalAmount: 1000, refundedAmount: 0, currency: "AED" };
});

describe("credit notes against one invoice", () => {
  it("two issued at once can't refund more than the invoice total", async () => {
    const [a, b] = await Promise.all([issue(700), issue(700)]);

    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(created).toHaveLength(1);
    expect(stored.refundedAmount).toBe(700);
  });

  it("two that fit together both go through and the totals add up", async () => {
    const [a, b] = await Promise.all([issue(400), issue(600)]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(created).toHaveLength(2);
    expect(stored.refundedAmount).toBe(1000);
    expect(stored.status).toBe("refunded");
  });

  it("gives the reservation back when the credit note can't be written", async () => {
    failCreate = true;
    await expect(issue(300)).rejects.toThrow();
    expect(stored.refundedAmount).toBe(0);
  });

  it("still refuses an amount over what is left", async () => {
    stored.refundedAmount = 900;
    const res = await issue(200);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/maximum refundable amount of 100/);
  });
});
