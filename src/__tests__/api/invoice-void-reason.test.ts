/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";
import { Types } from "mongoose";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: connectDB,
  connectDB,
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

const invoiceDoc = {
  _id: new Types.ObjectId("507f1f77bcf86cd799439011"),
  status: "issued",
  totalAmount: 1000,
  subtotal: 1000,
  discountAmount: 0,
  commissions: [],
  voidedBy: null,
  voidedAt: null,
  voidReason: null,
  save: jest.fn(),
};

const Invoice = {
  findById: jest.fn().mockResolvedValue(invoiceDoc),
};

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: Invoice,
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock("@/lib/invoices/access", () => ({
  canAccessInvoice: jest.fn().mockResolvedValue(true),
}));

jest.mock("@/lib/invoices/commissionRecords", () => ({
  reverseCommissionsForInvoice: jest.fn().mockResolvedValue({ reversed: 0, alreadyPaid: 0 }),
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn().mockReturnValue({ userId: "user_001", role: "super_agent" }),
}));

jest.mock("@/lib/integrations/webhookDispatcher", () => ({
  dispatchWebhook: jest.fn(),
}));

describe("Invoice void with reason validation", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    invoiceDoc.save.mockResolvedValue(undefined);
    invoiceDoc.voidedBy = null;
    invoiceDoc.voidedAt = null;
    invoiceDoc.voidReason = null;
    invoiceDoc.status = "issued";
  });

  it("rejects void without voidReason", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439011", {
      method: "PATCH",
      body: JSON.stringify({ status: "void" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "voidReason",
          message: expect.stringMatching(/required/i),
        }),
      ])
    );
  });

  it("rejects void with reason too short (< 10 characters)", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439011", {
      method: "PATCH",
      body: JSON.stringify({ status: "void", voidReason: "short" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "voidReason",
          message: expect.stringMatching(/at least 10/i),
        }),
      ])
    );
  });

  it("accepts void with sufficient reason and stores it", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439011", {
      method: "PATCH",
      body: JSON.stringify({ status: "void", voidReason: "Duplicate entry from earlier sync" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });

    expect(res.status).toBe(200);
    expect(invoiceDoc.voidReason).toBe("Duplicate entry from earlier sync");
    expect(invoiceDoc.save).toHaveBeenCalled();
  });

  it("does not allow voiding paid invoices", async () => {
    auth.mockResolvedValue({ user: { id: "sa_001", role: "super_agent", locale: "en" } });
    invoiceDoc.status = "paid";

    const { PATCH } = await import("@/app/api/invoices/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/507f1f77bcf86cd799439011", {
      method: "PATCH",
      body: JSON.stringify({ status: "void", voidReason: "Duplicate entry from earlier sync" }),
    });

    const res = await PATCH(req, { params: Promise.resolve({ id: "507f1f77bcf86cd799439011" }) });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/paid/i);
  });
});
