/**
 * @jest-environment node
 */
/**
 * EMPLOYER-FIX-PLAN E1 — talent-search must reject job_seeker/other roles,
 * only employer/agent/super_agent/admin may browse the CV pool.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function, _opts: unknown) => {
    return async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx);
  },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      select: jest.fn(() => ({
        populate: jest.fn(() => ({
          sort: jest.fn(() => ({
            skip: jest.fn(() => ({
              limit: jest.fn(() => ({
                lean: jest.fn(async () => []),
              })),
            })),
          })),
        })),
      })),
    })),
    countDocuments: jest.fn(async () => 0),
  },
}));

jest.mock("@/models/User", () => ({ __esModule: true, default: {} }));

import { GET as _GET } from "@/app/api/employer/talent-search/route";

function withCtx(ctx: { userId: string; role: string; locale: string }) {
  const req = new NextRequest("http://localhost:3000/api/employer/talent-search");
  (req as unknown as { __ctx: unknown }).__ctx = ctx;
  return req;
}

const GET = _GET as unknown as (req: NextRequest) => Promise<Response>;

describe("GET /api/employer/talent-search RBAC", () => {
  it("rejects job_seeker (was the CVE: any seeker could enumerate other seekers' CVs)", async () => {
    const res = await GET(withCtx({ userId: "u1", role: "job_seeker", locale: "en" }));
    expect(res.status).toBe(403);
  });

  it("allows employer", async () => {
    const res = await GET(withCtx({ userId: "u1", role: "employer", locale: "en" }));
    expect(res.status).toBe(200);
  });

  it("allows agent and super_agent and admin", async () => {
    for (const role of ["agent", "super_agent", "admin"]) {
      const res = await GET(withCtx({ userId: "u1", role, locale: "en" }));
      expect(res.status).toBe(200);
    }
  });
});
