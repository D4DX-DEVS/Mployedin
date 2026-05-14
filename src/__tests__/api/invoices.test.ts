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

const invoiceChain = {
  populate: jest.fn().mockReturnThis(),
  sort: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([]),
};

const Invoice = {
  find: jest.fn().mockReturnValue(invoiceChain),
  countDocuments: jest.fn().mockResolvedValue(0),
  aggregate: jest.fn().mockResolvedValue([]),
};

jest.mock("@/models/Invoice", () => ({
  __esModule: true,
  default: Invoice,
}));

const employerSearchChain = {
  select: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([{ _id: "emp_001" }]),
};

const Employer = {
  find: jest.fn().mockReturnValue(employerSearchChain),
};

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: Employer,
}));

const jobSearchChain = {
  select: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([{ _id: "job_001" }]),
};

const Job = {
  find: jest.fn().mockReturnValue(jobSearchChain),
};

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: Job,
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(),
  },
}));

const superAgentLookupChain = {
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue({ _id: "sa_001", agentIds: ["agent_001", "agent_002"] }),
};

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue(superAgentLookupChain),
  },
}));

describe("Invoices API", () => {
  const { auth } = require("@/lib/auth/config");
  const SuperAgent = require("@/models/SuperAgent").default;

  beforeEach(() => {
    jest.clearAllMocks();
    invoiceChain.populate.mockReturnThis();
    invoiceChain.sort.mockReturnThis();
    invoiceChain.skip.mockReturnThis();
    invoiceChain.limit.mockReturnThis();
    employerSearchChain.select.mockReturnThis();
    employerSearchChain.limit.mockReturnThis();
    jobSearchChain.select.mockReturnThis();
    jobSearchChain.limit.mockReturnThis();
    superAgentLookupChain.select.mockReturnThis();
  });

  it("expands admin search beyond invoice number", async () => {
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });

    const { GET } = await import("@/app/api/invoices/route");
    const req = new NextRequest("http://localhost:3000/api/invoices?search=Acme");

    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(Employer.find).toHaveBeenCalled();
    expect(Job.find).toHaveBeenCalled();

    const query = Invoice.find.mock.calls[0][0] as { $or?: Array<Record<string, unknown>> };

    expect(query.$or).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ invoiceNumber: expect.any(RegExp) }),
        expect.objectContaining({ "billingDetails.companyName": expect.any(RegExp) }),
        expect.objectContaining({ employerId: { $in: ["emp_001"] } }),
        expect.objectContaining({ jobId: { $in: ["job_001"] } }),
      ])
    );
  });

  it("keeps staff scoping and search conditions composed together", async () => {
    auth.mockResolvedValue({ user: { id: "sa_user_001", role: "super_agent", locale: "en" } });

    const { GET } = await import("@/app/api/invoices/route");
    const req = new NextRequest("http://localhost:3000/api/invoices?search=Acme");

    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(SuperAgent.findOne).toHaveBeenCalledWith({ userId: "sa_user_001" });

    const query = Invoice.find.mock.calls[0][0] as { $and?: Array<Record<string, unknown>> };

    expect(query.$and).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          $or: expect.arrayContaining([
            { userId: "sa_user_001" },
            { agentId: { $in: ["agent_001", "agent_002"] } },
          ]),
        }),
        expect.objectContaining({
          $or: expect.arrayContaining([
            expect.objectContaining({ invoiceNumber: expect.any(RegExp) }),
            expect.objectContaining({ "billingDetails.companyName": expect.any(RegExp) }),
          ]),
        }),
      ])
    );
  });

  it("skips cross-collection expansion for one-character searches", async () => {
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });

    const { GET } = await import("@/app/api/invoices/route");
    const req = new NextRequest("http://localhost:3000/api/invoices?search=A");

    const res = await GET(req, { params: Promise.resolve({}) });

    expect(res.status).toBe(200);
    expect(Employer.find).not.toHaveBeenCalled();
    expect(Job.find).not.toHaveBeenCalled();
  });
});