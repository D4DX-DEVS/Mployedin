/**
 * @jest-environment node
 *
 * GET /api/invoices/billable-hires (plan T1): per-job counts and the
 * Ready-to-bill list, scoped to who may invoice the job.
 */

import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: connectDB, connectDB }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));

/** A Mongoose-style query: any chain of select/populate/sort/limit, then lean(). */
function query(result: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "populate", "sort", "limit"]) q[m] = () => q;
  q.lean = () => Promise.resolve(result);
  return q;
}

const jobFindOne = jest.fn();
const jobFind = jest.fn();
const placementFind = jest.fn();
const applicationFind = jest.fn();
const applicationAggregate = jest.fn();
const invoiceFind = jest.fn();
const agentFindOne = jest.fn();
const findBilledPlacements = jest.fn();
const getSuperAgentScope = jest.fn();

jest.mock("@/models/Job", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => jobFindOne(...a), find: (...a: unknown[]) => jobFind(...a) } }));
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { find: (...a: unknown[]) => placementFind(...a) } }));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => applicationFind(...a), aggregate: (...a: unknown[]) => applicationAggregate(...a) },
}));
jest.mock("@/models/Invoice", () => ({ __esModule: true, default: { find: (...a: unknown[]) => invoiceFind(...a) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => agentFindOne(...a) } }));
jest.mock("@/lib/invoices/hireBilling", () => ({ findBilledPlacements: (...a: unknown[]) => findBilledPlacements(...a) }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: (...a: unknown[]) => getSuperAgentScope(...a) }));

const MY_AGENT = "507f1f77bcf86cd799439031";
const OTHER_AGENT = "507f1f77bcf86cd799439032";
const JOB = "507f1f77bcf86cd799439011";
const EMPLOYER = "507f1f77bcf86cd799439021";
const APP = { a: "507f1f77bcf86cd7994391a1", b: "507f1f77bcf86cd7994391b2", c: "507f1f77bcf86cd7994391c3" };
const HIRE = { a: "507f1f77bcf86cd7994390a1", b: "507f1f77bcf86cd7994390b2" };

const seeker = (name: string) => ({ userId: { name } });

async function get(url: string) {
  const { GET } = await import("@/app/api/invoices/billable-hires/route");
  return GET(new NextRequest(`http://localhost:3000${url}`), { params: Promise.resolve({}) });
}

describe("GET /api/invoices/billable-hires", () => {
  const { auth } = require("@/lib/auth/config");

  beforeEach(() => {
    jest.clearAllMocks();
    auth.mockResolvedValue({ user: { id: "agent_user_1", role: "agent", locale: "en" } });
    agentFindOne.mockReturnValue(query({ _id: MY_AGENT }));
    findBilledPlacements.mockResolvedValue(new Map());
    invoiceFind.mockReturnValue(query([]));
  });

  describe("one job", () => {
    const job = (agentId: string) => ({
      _id: JOB, title: "Warehouse Supervisor", status: "active", vacancies: 5, agentId,
      employerId: { _id: EMPLOYER, companyName: "Al Noor Logistics" },
    });

    it("counts wanted, hired, billed and ready, and lists hired candidates with no hire record", async () => {
      jobFindOne.mockReturnValue(query(job(MY_AGENT)));
      applicationFind.mockReturnValue(query([
        { _id: APP.a, jobSeekerId: seeker("Omar H.") },
        { _id: APP.b, jobSeekerId: seeker("Ravi K.") },
        { _id: APP.c, jobSeekerId: seeker("Maria S.") },
      ]));
      placementFind.mockReturnValue(query([
        { _id: HIRE.a, jobId: JOB, applicationId: APP.a, placedAt: new Date("2026-10-02") },
        { _id: HIRE.b, jobId: JOB, applicationId: APP.b, placedAt: new Date("2026-11-12") },
      ]));
      findBilledPlacements.mockResolvedValue(new Map([[HIRE.a, "INV-2026-0365"]]));
      // Last fee for the same employer + job title.
      invoiceFind.mockReturnValue(query([{ jobId: "507f1f77bcf86cd7994390ee", lineItems: [{ placementId: "x", unitPrice: 4000, amount: 4000 }] }]));
      jobFind.mockReturnValue(query([{ _id: "507f1f77bcf86cd7994390ee", title: "warehouse supervisor " }]));

      const res = await get(`/api/invoices/billable-hires?jobId=${JOB}`);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(expect.objectContaining({ wanted: 5, hired: 3, billed: 1, ready: 1 }));
      expect(json.job).toEqual(expect.objectContaining({ title: "Warehouse Supervisor", employerName: "Al Noor Logistics" }));
      expect(json.hires).toEqual([
        expect.objectContaining({ placementId: HIRE.a, name: "Omar H.", billedOn: { invoiceNumber: "INV-2026-0365" }, lastFeeHint: 4000 }),
        expect.objectContaining({ placementId: HIRE.b, name: "Ravi K.", billedOn: null, lastFeeHint: 4000 }),
      ]);
      expect(json.missingHireRecords).toEqual([{ applicationId: APP.c, name: "Maria S." }]);
    });

    it("gives no fee hint when the employer has no earlier fee for that job title", async () => {
      jobFindOne.mockReturnValue(query(job(MY_AGENT)));
      applicationFind.mockReturnValue(query([{ _id: APP.b, jobSeekerId: seeker("Ravi K.") }]));
      placementFind.mockReturnValue(query([{ _id: HIRE.b, jobId: JOB, applicationId: APP.b, placedAt: new Date() }]));

      const json = await (await get(`/api/invoices/billable-hires?jobId=${JOB}`)).json();
      expect(json.hires[0].lastFeeHint).toBeNull();
    });

    it("hides another agent's job", async () => {
      jobFindOne.mockReturnValue(query(job(OTHER_AGENT)));
      const res = await get(`/api/invoices/billable-hires?jobId=${JOB}`);
      expect(res.status).toBe(404);
      expect(applicationFind).not.toHaveBeenCalled();
    });

    it("lets a super agent see their agents' jobs", async () => {
      auth.mockResolvedValue({ user: { id: "sa_user_1", role: "super_agent", locale: "en" } });
      getSuperAgentScope.mockResolvedValue({ effectiveAgentIds: [OTHER_AGENT] });
      jobFindOne.mockReturnValue(query(job(OTHER_AGENT)));
      applicationFind.mockReturnValue(query([]));
      placementFind.mockReturnValue(query([]));

      const res = await get(`/api/invoices/billable-hires?jobId=${JOB}`);
      expect(res.status).toBe(200);
    });

    it("rejects a malformed job id", async () => {
      const res = await get("/api/invoices/billable-hires?jobId=nope");
      expect(res.status).toBe(400);
    });

    it("refuses employers", async () => {
      auth.mockResolvedValue({ user: { id: "emp_1", role: "employer", locale: "en" } });
      const res = await get(`/api/invoices/billable-hires?jobId=${JOB}`);
      expect(res.status).toBe(403);
    });
  });

  describe("ready-to-bill list", () => {
    const JOB2 = "507f1f77bcf86cd799439012";
    const HIRE_X = "507f1f77bcf86cd7994390c3";

    it("lists only jobs with hired, unbilled hires, newest first", async () => {
      jobFind
        .mockReturnValueOnce(query([{ _id: JOB }, { _id: JOB2 }])) // in-scope job ids
        .mockReturnValueOnce(query([ // page jobs
          { _id: JOB, title: "Warehouse Supervisor", status: "active", vacancies: 5, employerId: { companyName: "Al Noor" } },
        ]));
      placementFind
        .mockReturnValueOnce(query([
          { _id: HIRE.a, jobId: JOB, applicationId: APP.a, placedAt: new Date("2026-10-02") }, // billed
          { _id: HIRE.b, jobId: JOB, applicationId: APP.b, placedAt: new Date("2026-11-12") }, // ready
          { _id: HIRE_X, jobId: JOB2, applicationId: APP.c, placedAt: new Date("2026-11-20") }, // application no longer hired
        ]))
        .mockReturnValueOnce(query([{ _id: HIRE.b, jobSeekerId: seeker("Ravi K.") }]));
      applicationFind.mockReturnValue(query([{ _id: APP.a }, { _id: APP.b }]));
      findBilledPlacements.mockResolvedValue(new Map([[HIRE.a, "INV-1"]]));
      applicationAggregate.mockResolvedValue([{ _id: JOB, n: 2 }]);

      const res = await get("/api/invoices/billable-hires?pageSize=7");
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual(expect.objectContaining({ page: 1, pageSize: 20, total: 1, totalPages: 1 }));
      expect(json.data).toEqual([
        expect.objectContaining({
          jobId: JOB, title: "Warehouse Supervisor", wanted: 5, hired: 2, billed: 1, ready: 1,
          readyHires: [expect.objectContaining({ placementId: HIRE.b, name: "Ravi K." })],
        }),
      ]);
      // Scoped to the agent's own jobs.
      expect(jobFind.mock.calls[0][0]).toEqual(expect.objectContaining({ agentId: { $in: [expect.anything()] } }));
    });

    it("returns an empty page for an agent with no profile", async () => {
      agentFindOne.mockReturnValue(query(null));
      const json = await (await get("/api/invoices/billable-hires")).json();
      expect(json).toEqual({ data: [], page: 1, pageSize: 20, total: 0, totalPages: 0 });
      expect(jobFind).not.toHaveBeenCalled();
    });
  });
});
