/**
 * @jest-environment node
 */
/**
 * API Tests — Screening Analytics
 * Tests: GET (aggregate screening answers), auth (employer-only), validation
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "emp_001", userId: "user_001" }) }),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockImplementation(() => ({
      lean: jest.fn().mockResolvedValue({ _id: "job_001", employerId: "emp_001", title: "Engineer" }),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          _id: "job_001",
          title: "Engineer",
          screeningQuestions: [{ id: "q1", label: "Years of experience?", type: "number" }],
        }),
      }),
    })),
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: "app_1", screeningAnswers: [{ questionId: "q1", answer: "5" }] },
          { _id: "app_2", screeningAnswers: [{ questionId: "q1", answer: "3" }] },
        ]),
      }),
    }),
  },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

describe("Screening Analytics API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 for non-employer", async () => {
    const { GET } = await import("@/app/api/employers/screening-analytics/route");
    const req = new NextRequest("http://localhost/api/employers/screening-analytics?jobId=job_001");
    const ctx = { userId: "user_001", role: "job_seeker" };
    const res = await (GET as Function)(req, ctx);

    expect(res.status).toBe(403);
  });

  it("returns 400 when jobId is missing", async () => {
    const { GET } = await import("@/app/api/employers/screening-analytics/route");
    const req = new NextRequest("http://localhost/api/employers/screening-analytics");
    const ctx = { userId: "user_001", role: "employer" };
    const res = await (GET as Function)(req, ctx);

    expect(res.status).toBe(400);
  });

  it("returns analytics for valid employer job", async () => {
    const { GET } = await import("@/app/api/employers/screening-analytics/route");
    const req = new NextRequest("http://localhost/api/employers/screening-analytics?jobId=job_001");
    const ctx = { userId: "user_001", role: "employer" };
    const res = await (GET as Function)(req, ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.questions).toBeDefined();
    expect(data.jobTitle).toBe("Engineer");
    expect(data.totalApplications).toBe(2);
  });
});
