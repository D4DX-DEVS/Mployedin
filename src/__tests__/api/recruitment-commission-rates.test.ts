/**
 * @jest-environment node
 */
/**
 * GET /api/invoices/recruitment/commission-rates — the rates the invoice form
 * previews must be the rates the server applies, country rules included.
 */
import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: connectDB, connectDB }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));

const getSuperAgentScope = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: (...a: unknown[]) => getSuperAgentScope(...a) }));

const jobLean = jest.fn();
const employerLean = jest.fn();
const agentLean = jest.fn();
const agentFindOneLean = jest.fn();
const superAgentLean = jest.fn();
const settingsLean = jest.fn();

const chain = (lean: jest.Mock) => () => ({ select: () => ({ lean }) });
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: chain(jobLean) } }));
jest.mock("@/models/Employer", () => ({ __esModule: true, default: { findById: chain(employerLean) } }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findById: chain(agentLean), findOne: chain(agentFindOneLean) },
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findById: chain(superAgentLean) } }));
jest.mock("@/models/SystemSettings", () => ({ __esModule: true, default: { findOne: chain(settingsLean) } }));


const JOB_ID = "507f1f77bcf86cd799439011";
const AGENT_ID = "507f1f77bcf86cd799439031";

async function call(jobId: string | null = JOB_ID) {
  const url = new URL("http://localhost:3000/api/invoices/recruitment/commission-rates");
  if (jobId) url.searchParams.set("jobId", jobId);
  const { GET } = await import("@/app/api/invoices/recruitment/commission-rates/route");
  const res = await GET(new NextRequest(url), { params: Promise.resolve({}) });
  return { status: res.status, body: await res.json() };
}

describe("recruitment invoice commission-rate preview", () => {
  const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    (await import("@/lib/commissions/resolveRate")).clearCommissionOverrideCache();
    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    jobLean.mockResolvedValue({ _id: JOB_ID, agentId: AGENT_ID, employerId: "emp_1" });
    employerLean.mockResolvedValue({ country: "Saudi Arabia" });
    agentLean.mockResolvedValue({ _id: AGENT_ID, commissionRate: 10, superAgentId: "sa_1" });
    superAgentLean.mockResolvedValue({ _id: "sa_1", overrideRate: 15 });
    settingsLean.mockResolvedValue({ commissionOverrides: [{ countryCode: "SA", rate: 4 }] });
  });

  it("returns the country rule in place of the profile rates", async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(body).toEqual({
      agent: { rate: 4, source: "country_override", countryCode: "SA", profileRate: 10 },
      superAgent: { rate: 4, source: "country_override", countryCode: "SA", profileRate: 15 },
    });
  });

  it("returns the profile rates when no rule covers the employer's country", async () => {
    employerLean.mockResolvedValue({ country: "India" });
    const { body } = await call();
    expect(body.agent).toEqual({ rate: 10, source: "agent_default", profileRate: 10 });
    expect(body.superAgent).toEqual({ rate: 15, source: "super_agent_default", profileRate: 15 });
  });

  it("keeps a 0% profile at 0% — invoice creation adds no line for it", async () => {
    agentLean.mockResolvedValue({ _id: AGENT_ID, commissionRate: 0, superAgentId: null });
    const { body } = await call();
    expect(body.agent).toEqual({ rate: 0, source: "agent_default", profileRate: 0 });
    expect(body.superAgent).toBeNull();
  });

  it("returns no lines for a job with no agent", async () => {
    jobLean.mockResolvedValue({ _id: JOB_ID, agentId: null, employerId: "emp_1" });
    const { body } = await call();
    expect(body).toEqual({ agent: null, superAgent: null });
  });

  it("rejects an agent previewing a job that is not theirs", async () => {
    auth.mockResolvedValue({ user: { id: "agent_user_2", role: "agent", locale: "en" } });
    agentFindOneLean.mockResolvedValue({ _id: "someone_else" });
    const { status } = await call();
    expect(status).toBe(403);
    expect(agentLean).not.toHaveBeenCalled();
  });

  it("rejects a super-agent previewing a job outside their team", async () => {
    auth.mockResolvedValue({ user: { id: "sa_user_1", role: "super_agent", locale: "en" } });
    getSuperAgentScope.mockResolvedValue({ effectiveAgentIds: ["another_agent"] });
    expect((await call()).status).toBe(403);

    getSuperAgentScope.mockResolvedValue({ effectiveAgentIds: [AGENT_ID] });
    expect((await call()).status).toBe(200);
  });

  it("rejects roles that cannot raise recruitment invoices, and bad ids", async () => {
    auth.mockResolvedValue({ user: { id: "emp_user", role: "employer", locale: "en" } });
    expect((await call()).status).toBe(403);

    auth.mockResolvedValue({ user: { id: "admin_001", role: "admin", locale: "en" } });
    expect((await call("not-an-id")).status).toBe(400);
    expect((await call(null)).status).toBe(400);
  });
});
