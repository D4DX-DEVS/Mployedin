/**
 * @jest-environment node
 *
 * 2026-09-23 audit: GET /api/applications?fetchEmployers=true&fetchStats=true
 * ran its employer list and stats aggregates unscoped for super_agent, so a
 * super-agent could list every employer on the platform and read platform-wide
 * application counts. Only the admin page uses these params.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) =>
    handler(req, { userId: "sa_user_1", role: "super_agent", locale: "en" }),
}));

const employerFind = jest.fn(() => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ _id: "e1", companyName: "Out Of Territory LLC" }] }) }) }) }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { find: (...a: unknown[]) => employerFind(...(a as [])), findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(), find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) } }));
jest.mock("@/models/CompanyUser", () => ({ __esModule: true, CompanyUser: { findOne: jest.fn() } }));
jest.mock("@/models/Job", () => {
  const q = () => { const c: Record<string, unknown> = {}; for (const m of ["select", "sort", "limit"]) c[m] = () => c; c.lean = async () => []; return c; };
  return { __esModule: true, default: { find: jest.fn(() => q()) } };
});
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => ["64b000000000000000000009"]) }));

const aggregate = jest.fn(async () => [{ _id: "applied", count: 999 }]);
function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["skip", "limit", "select", "populate", "sort"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => []);
  return c;
}
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain()), countDocuments: jest.fn(async () => 0), aggregate: (...a: unknown[]) => aggregate(...(a as [])) },
}));

async function list(qs: string) {
  const { getHandler } = await import("@/app/api/applications/handlers");
  const { withAuth } = await import("@/lib/auth/withAuth");
  const wrapped = withAuth(getHandler) as unknown as (req: NextRequest) => Promise<Response>;
  return wrapped(new NextRequest(`http://localhost:3888/api/applications?${qs}`));
}

describe("GET /api/applications as super_agent", () => {
  it("does not list every employer on the platform", async () => {
    const res = await list("fetchEmployers=true");
    const body = await res.json();
    expect(employerFind).not.toHaveBeenCalled();
    expect(body.allEmployers ?? []).toEqual([]);
  });

  it("limits the job filter list to the super-agent's own employers", async () => {
    const { default: Job } = await import("@/models/Job");
    (Job.find as jest.Mock).mockClear();
    await list("fetchJobs=true");
    const jobListQuery = (Job.find as jest.Mock).mock.calls
      .map((c) => c[0] as Record<string, unknown>)
      .find((q) => q.status && (q.status as { $in?: string[] }).$in?.includes("closed"));
    expect(jobListQuery).toBeDefined();
    expect(jobListQuery!.employerId).toEqual({ $in: ["64b000000000000000000009"] });
  });

  it("does not return platform-wide application stats", async () => {
    const res = await list("fetchStats=true");
    const body = await res.json();
    expect(body.stats ?? null).toBeNull();
  });
});
