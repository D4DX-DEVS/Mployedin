/**
 * @jest-environment node
 */
/**
 * GET /api/jobs/match-preview tells a job poster how many candidates on the
 * platform match the role being drafted, and their top skills. It is only
 * called from the job-posting form, but it was wrapped in a bare withAuth(), so
 * any signed-in account — a job seeker included — could query the candidate
 * pool. It now requires `jobs:create`.
 */
import { canAccess } from "@/lib/permissions/matrix";

let declaredGuard: unknown;
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function, guard?: unknown) => {
    declaredGuard = guard;
    return handler;
  },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimitDual: jest.fn(), RATE_LIMIT_CONFIGS: { api: {} } }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: {} }));

describe("GET /api/jobs/match-preview — job posters only", () => {
  it("declares the jobs:create guard", () => {
    jest.isolateModules(() => { require("@/app/api/jobs/match-preview/route"); });
    expect(declaredGuard).toEqual({ resource: "jobs", action: "create" });
  });

  it("refuses job seekers and admits every role that posts jobs", () => {
    expect(canAccess("job_seeker", "jobs", "create")).toBe(false);
    for (const role of ["employer", "agent", "super_agent", "admin"] as const) {
      expect(canAccess(role, "jobs", "create")).toBe(true);
    }
  });
});
