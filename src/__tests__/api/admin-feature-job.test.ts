/**
 * @jest-environment node
 */
/**
 * API Tests — Admin Feature Job
 * Tests: POST (feature/unfeature job), auth (admin-only), job not found
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

const mockJob = {
  _id: "job_001",
  title: "Software Engineer",
  isFeatured: false,
  featuredUntil: null,
  save: jest.fn().mockResolvedValue(true),
};

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(),
  },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function, _opts?: unknown) => handler,
}));

describe("Admin Feature Job API", () => {
  let Job: { findById: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    Job = (await import("@/models/Job")).default as unknown as { findById: jest.Mock };
    Job.findById.mockResolvedValue({ ...mockJob, save: jest.fn().mockResolvedValue(true) });
  });

  it("returns 403 for non-admin user", async () => {
    const { POST } = await import("@/app/api/admin/jobs/[id]/feature/route");
    const req = new NextRequest("http://localhost/api/admin/jobs/job_001/feature", {
      method: "POST",
      body: JSON.stringify({ featured: true }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { userId: "user_001", role: "employer" };
    const res = await (POST as Function)(req, ctx, { id: "job_001" });

    expect(res.status).toBe(403);
  });

  it("features a job for 30 days by default", async () => {
    const saveMock = jest.fn().mockResolvedValue(true);
    Job.findById.mockResolvedValue({ ...mockJob, save: saveMock });

    const { POST } = await import("@/app/api/admin/jobs/[id]/feature/route");
    const req = new NextRequest("http://localhost/api/admin/jobs/job_001/feature", {
      method: "POST",
      body: JSON.stringify({ featured: true }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { userId: "admin_001", role: "admin" };
    const res = await (POST as Function)(req, ctx, { id: "job_001" });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.featuredUntil).toBeDefined();
    expect(saveMock).toHaveBeenCalled();
  });

  it("unfeatures a job", async () => {
    const saveMock = jest.fn().mockResolvedValue(true);
    Job.findById.mockResolvedValue({ ...mockJob, isFeatured: true, save: saveMock });

    const { POST } = await import("@/app/api/admin/jobs/[id]/feature/route");
    const req = new NextRequest("http://localhost/api/admin/jobs/job_001/feature", {
      method: "POST",
      body: JSON.stringify({ featured: false }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { userId: "admin_001", role: "admin" };
    const res = await (POST as Function)(req, ctx, { id: "job_001" });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.message).toContain("unfeatured");
  });

  it("returns 404 if job not found", async () => {
    Job.findById.mockResolvedValue(null);

    const { POST } = await import("@/app/api/admin/jobs/[id]/feature/route");
    const req = new NextRequest("http://localhost/api/admin/jobs/job_999/feature", {
      method: "POST",
      body: JSON.stringify({ featured: true }),
      headers: { "Content-Type": "application/json" },
    });
    const ctx = { userId: "admin_001", role: "admin" };
    const res = await (POST as Function)(req, ctx, { id: "job_999" });

    expect(res.status).toBe(404);
  });
});
