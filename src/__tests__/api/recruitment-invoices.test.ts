/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: connectDB,
  connectDB,
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/permissions/matrix", () => ({
  canAccess: jest.fn().mockReturnValue(true),
}));

jest.mock("@/lib/subscription/invoiceNumber", () => ({
  generateInvoiceNumber: jest.fn().mockResolvedValue("INV-2026-0001"),
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/integrations/webhookDispatcher", () => ({
  dispatchWebhook: jest.fn(),
}));

jest.mock("@/lib/commissions/resolveRate", () => ({
  resolveCommissionRate: jest.fn().mockImplementation(async (rate: number) => ({ rate, source: "agent_default" })),
  resolveOverrideRate: jest.fn().mockImplementation(async (rate: number) => ({ rate, source: "super_agent_default" })),
}));

const jobFindByIdLean = jest.fn();
const employerFindByIdLean = jest.fn();
const agentFindByIdLean = jest.fn();
const agentFindOneLean = jest.fn();
const superAgentFindByIdLean = jest.fn();
const settingsLean = jest.fn();
const invoiceFindOneLean = jest.fn();
const invoiceCreate = jest.fn();
const commissionCreate = jest.fn();

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ lean: jobFindByIdLean })),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ select: jest.fn(() => ({ lean: employerFindByIdLean })) })),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ lean: agentFindByIdLean })),
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: agentFindOneLean })) })),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({ lean: superAgentFindByIdLean })),
  },
}));

jest.mock("@/models/SystemSettings", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ lean: settingsLean })),
  },
}));

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: jest.fn(() => ({ lean: invoiceFindOneLean })) })),
    create: jest.fn((payload) => invoiceCreate(payload)),
    deleteOne: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock("@/models/Commission", () => ({
  __esModule: true,
  default: {
    create: jest.fn((...args) => {
      commissionCreate(...args);
      return [{ _id: "comm_rec" }];
    }),
    countDocuments: jest.fn(() => ({ session: jest.fn().mockResolvedValue(0) })),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
}));

describe("Recruitment invoice creation API", () => {
  const { auth } = require("@/lib/auth/config");
  const Invoice = require("@/models/Invoice").default;
  const Commission = require("@/models/Commission").default;

  beforeEach(() => {
    jest.clearAllMocks();

    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });

    jobFindByIdLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439011",
      title: "Senior Recruiter",
      employerId: { toString: () => "507f1f77bcf86cd799439021" },
      agentId: { toString: () => "507f1f77bcf86cd799439031" },
    });

    employerFindByIdLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439021",
      userId: "507f1f77bcf86cd799439041",
      companyName: "Acme Talent",
      companyEmail: "finance@acme.test",
      phone: "+971500000000",
      address: "Dubai",
      country: "AE",
      taxId: "AE123",
    });

    agentFindByIdLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439031",
      superAgentId: "507f1f77bcf86cd799439051",
      commissionRate: 10,
    });

    superAgentFindByIdLean.mockResolvedValue({
      _id: "507f1f77bcf86cd799439051",
      overrideRate: 5,
    });

    agentFindOneLean.mockResolvedValue({ _id: "507f1f77bcf86cd799439031" });
    settingsLean.mockResolvedValue({ defaultCurrency: "AED" });
    invoiceFindOneLean.mockResolvedValue(null);

    invoiceCreate.mockImplementation(async (payload) => ({
      _id: "507f1f77bcf86cd799439061",
      ...payload,
      totalAmount: payload.totalAmount,
      taxAmount: payload.taxAmount ?? 45,
    }));

    commissionCreate.mockImplementation(async (payload) => ({
      _id: `comm_${payload.type}`,
      ...payload,
    }));
  });

  it("rejects a recruitment invoice request without a job id", async () => {
    const { POST } = await import("@/app/api/invoices/recruitment/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/recruitment", {
      method: "POST",
      body: JSON.stringify({
        employerId: "507f1f77bcf86cd799439021",
        amount: 1000,
        currency: "AED",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Validation failed");
    expect(jobFindByIdLean).not.toHaveBeenCalled();
  });

  it("rejects invoices where the job does not belong to the selected employer", async () => {
    jobFindByIdLean.mockResolvedValueOnce({
      _id: "507f1f77bcf86cd799439011",
      title: "Senior Recruiter",
      employerId: { toString: () => "507f1f77bcf86cd799439099" },
      agentId: { toString: () => "507f1f77bcf86cd799439031" },
    });

    const { POST } = await import("@/app/api/invoices/recruitment/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/recruitment", {
      method: "POST",
      body: JSON.stringify({
        jobId: "507f1f77bcf86cd799439011",
        employerId: "507f1f77bcf86cd799439021",
        amount: 1000,
        currency: "AED",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toBe("Job does not belong to the specified employer");
    expect(Invoice.create).not.toHaveBeenCalled();
  });

  it("calculates agent and super-agent commissions from the pre-tax discounted subtotal", async () => {
    const { POST } = await import("@/app/api/invoices/recruitment/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/recruitment", {
      method: "POST",
      body: JSON.stringify({
        jobId: "507f1f77bcf86cd799439011",
        employerId: "507f1f77bcf86cd799439021",
        amount: 1000,
        currency: "AED",
        discountPercent: 10,
        taxType: "vat",
        taxPercent: 5,
        serviceCharge: 50,
        lineItems: [
          {
            description: "Placement fee",
            quantity: 1,
            unitPrice: 1000,
            amount: 1000,
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(201);
    expect(Invoice.create).toHaveBeenCalledTimes(1);

    const payload = invoiceCreate.mock.calls[0][0];
    expect(payload.totalAmount).toBe(995);
    expect(payload.amount).toBe(995);
    expect(payload.commissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "agent", rate: 10, amount: 90 }),
        expect.objectContaining({ role: "super_agent", rate: 5, amount: 45 }),
      ])
    );

    expect(Commission.create).toHaveBeenNthCalledWith(1, [expect.objectContaining({ type: "placement", amount: 90 })], {});
    expect(Commission.create).toHaveBeenNthCalledWith(2, [expect.objectContaining({ type: "override", amount: 45 })], {});
  });

  it("forces agent-created invoices into pending approval and defers commission records", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_001", role: "agent", locale: "en" } });

    const { POST } = await import("@/app/api/invoices/recruitment/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/recruitment", {
      method: "POST",
      body: JSON.stringify({
        jobId: "507f1f77bcf86cd799439011",
        employerId: "507f1f77bcf86cd799439021",
        amount: 1000,
        currency: "AED",
        status: "issued",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(invoiceCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
      status: "pending_approval",
      issuedAt: undefined,
    }));
    expect(Commission.create).not.toHaveBeenCalled();
    expect(json.commissions).toHaveLength(0);
    expect(json.message).toContain("submitted for approval");
  });

  it("rejects duplicate active recruitment invoices for the same job and employer", async () => {
    invoiceFindOneLean.mockResolvedValueOnce({
      _id: "507f1f77bcf86cd799439071",
      invoiceNumber: "INV-EXISTING-001",
      status: "issued",
    });

    const { POST } = await import("@/app/api/invoices/recruitment/route");
    const req = new NextRequest("http://localhost:3000/api/invoices/recruitment", {
      method: "POST",
      body: JSON.stringify({
        jobId: "507f1f77bcf86cd799439011",
        employerId: "507f1f77bcf86cd799439021",
        amount: 1000,
        currency: "AED",
      }),
      headers: { "Content-Type": "application/json" },
    });

    const res = await POST(req, { params: Promise.resolve({}) });
    const json = await res.json();

    expect(res.status).toBe(409);
    expect(json.error).toContain("INV-EXISTING-001");
    expect(Invoice.create).not.toHaveBeenCalled();
  });
});