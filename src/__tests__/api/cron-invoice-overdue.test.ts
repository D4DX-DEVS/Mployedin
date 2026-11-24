/**
 * @jest-environment node
 *
 * The overdue job must only flag invoices that still owe money. It used to
 * flag zero invoices (free-plan renewals), which showed customers red
 * "Overdue" badges on AED 0 invoices and sent admins alerts for them.
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/security/cron-auth", () => ({ verifyCronRequest: () => null }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (...args: unknown[]) => notify(...args) }));

const invoiceFind = jest.fn();
const invoiceFindLean = jest.fn();
const invoiceUpdateMany = jest.fn();
jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    find: (...args: unknown[]) => {
      invoiceFind(...args);
      return { select: () => ({ limit: () => ({ lean: invoiceFindLean }) }) };
    },
    updateMany: (...args: unknown[]) => invoiceUpdateMany(...args),
  },
}));

const adminsLean = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: () => ({ select: () => ({ limit: () => ({ lean: adminsLean }) }) }) },
}));

async function runJob() {
  const { GET } = await import("@/app/api/cron/invoice-overdue/route");
  const res = await GET(new NextRequest("http://localhost/api/cron/invoice-overdue"));
  return res.json();
}

describe("GET /api/cron/invoice-overdue", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    invoiceUpdateMany.mockResolvedValue({ modifiedCount: 1 });
    adminsLean.mockResolvedValue([{ _id: "admin_1" }]);
  });

  it("only looks for past-due invoices that still owe money", async () => {
    invoiceFindLean.mockResolvedValue([]);
    await runJob();

    const query = invoiceFind.mock.calls[0][0];
    expect(query.status).toEqual({ $in: ["issued", "sent", "partially_paid"] });
    expect(query.dueDate.$lt).toBeInstanceOf(Date);
    expect(query.$or).toEqual([
      { balanceDue: { $gt: 0 } },
      { balanceDue: { $exists: false }, totalAmount: { $gt: 0 } },
    ]);
  });

  it("marks what it finds overdue and tells the admins", async () => {
    invoiceFindLean.mockResolvedValue([
      { _id: "inv_1", invoiceNumber: "INV-1", currency: "AED", totalAmount: 3150 },
    ]);
    const body = await runJob();

    expect(invoiceUpdateMany).toHaveBeenCalledWith({ _id: { $in: ["inv_1"] } }, { $set: { status: "overdue" } });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(body).toMatchObject({ success: true, found: 1, updated: 1, notified: 1 });
  });

  it("sends no alerts when nothing owes money", async () => {
    invoiceFindLean.mockResolvedValue([]);
    const body = await runJob();

    expect(notify).not.toHaveBeenCalled();
    expect(body).toMatchObject({ found: 0, notified: 0 });
  });
});
