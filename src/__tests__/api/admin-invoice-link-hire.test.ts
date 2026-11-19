/**
 * @jest-environment node
 */
/**
 * Linking an older invoice line to the hire it bills: admin only, one line at a
 * time, the hire must belong to the invoice's employer and the line's job, a
 * hire is never billed on two lines, and every link is audited.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: (...a: unknown[]) => logActivity(...a),
}));

const INVOICE_ID = "507f1f77bcf86cd799439011";
const EMPLOYER = "507f1f77bcf86cd799439021";
const JOB = "507f1f77bcf86cd799439031";
const HIRE = "507f1f77bcf86cd799439041";

let invoiceDoc: Record<string, unknown> | null;
let placementDoc: Record<string, unknown> | null;
let otherInvoices: unknown[];
const updateOne = jest.fn();

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: () => ({ lean: async () => invoiceDoc }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => otherInvoices }) })),
    updateOne: (...a: unknown[]) => updateOne(...a),
  },
}));
jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ select: () => ({ lean: async () => placementDoc }) })) },
}));

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

function post(body: unknown) {
  return new NextRequest(`http://localhost/api/admin/invoices/${INVOICE_ID}/link-hire`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function link(body: unknown) {
  const { POST } = await import("@/app/api/admin/invoices/[id]/link-hire/route");
  return POST(post(body), { params: Promise.resolve({ id: INVOICE_ID }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ user: { id: "507f1f77bcf86cd799439099", role: "admin", locale: "en" } });
  invoiceDoc = {
    _id: INVOICE_ID,
    invoiceNumber: "INV-2026-0910",
    employerId: EMPLOYER,
    jobId: JOB,
    status: "issued",
    lineItems: [
      { description: "Fee A", amount: 24000, jobId: JOB },
      { description: "Fee B", amount: 18000, jobId: JOB, placementId: "507f1f77bcf86cd799439042" },
    ],
  };
  placementDoc = { _id: HIRE, employerId: EMPLOYER, jobId: JOB };
  otherInvoices = [];
  updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("POST /api/admin/invoices/[id]/link-hire", () => {
  it("links only the chosen line and audits it", async () => {
    const res = await link({ lineIndex: 0, placementId: HIRE, reason: "Legacy invoice" });
    expect(res.status).toBe(200);
    const [filter, update] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: INVOICE_ID, "lineItems.0.placementId": null });
    expect(Object.keys(update.$set)).toEqual([
      "lineItems.0.placementId",
      "lineItems.0.placementLinkedBy",
      "lineItems.0.placementLinkedAt",
    ]);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "invoice.line_hire_linked", resourceId: INVOICE_ID }));
  });

  it("is admin only", async () => {
    auth.mockResolvedValue({ user: { id: "sa", role: "super_agent", locale: "en" } });
    const res = await link({ lineIndex: 0, placementId: HIRE });
    expect(res.status).toBe(403);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("never relinks a line that already has a hire", async () => {
    const res = await link({ lineIndex: 1, placementId: HIRE });
    expect(res.status).toBe(409);
  });

  it("rejects a hire from another employer or another job", async () => {
    placementDoc = { _id: HIRE, employerId: "507f1f77bcf86cd799439022", jobId: JOB };
    expect((await link({ lineIndex: 0, placementId: HIRE })).status).toBe(400);
    placementDoc = { _id: HIRE, employerId: EMPLOYER, jobId: "507f1f77bcf86cd799439032" };
    expect((await link({ lineIndex: 0, placementId: HIRE })).status).toBe(400);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("never bills one hire on two lines", async () => {
    otherInvoices = [{ lineItems: [{ placementId: HIRE }] }];
    const res = await link({ lineIndex: 0, placementId: HIRE });
    expect(res.status).toBe(409);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("reports a lost race instead of overwriting", async () => {
    updateOne.mockResolvedValue({ modifiedCount: 0 });
    const res = await link({ lineIndex: 0, placementId: HIRE });
    expect(res.status).toBe(409);
  });

  it("rejects a line index that is not on the invoice", async () => {
    expect((await link({ lineIndex: 7, placementId: HIRE })).status).toBe(400);
  });
});
