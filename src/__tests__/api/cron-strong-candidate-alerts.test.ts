/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/security/cron-auth", () => ({
  verifyCronRequest: jest.fn().mockReturnValue(null),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn() },
}));

const mockNotify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

// Mock Application model with chainable methods
const mockApplications = [
  {
    _id: "app_001",
    employerId: "emp_001",
    jobId: { _id: "job_001", title: "Frontend Engineer" },
    aiMatchScore: 85,
    appliedAt: new Date(),
  },
  {
    _id: "app_002",
    employerId: "emp_001",
    jobId: { _id: "job_001", title: "Frontend Engineer" },
    aiMatchScore: 82,
    appliedAt: new Date(),
  },
  {
    _id: "app_003",
    employerId: "emp_001",
    jobId: { _id: "job_002", title: "Backend Engineer" },
    aiMatchScore: 88,
    appliedAt: new Date(),
  },
  {
    _id: "app_004",
    employerId: "emp_002",
    jobId: { _id: "job_003", title: "Product Manager" },
    aiMatchScore: 91,
    appliedAt: new Date(),
  },
];

let mockApplicationResult = mockApplications;

const createApplicationChainable = () => ({
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  lean: jest.fn(async () => mockApplicationResult),
});

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => createApplicationChainable()),
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 4 }),
  },
}));

// Mock Employer model
const mockEmployers = [
  { _id: "emp_001", userId: "user_001", notificationPrefs: { emailNewApplicant: true } },
  { _id: "emp_002", userId: "user_002", notificationPrefs: { emailNewApplicant: false } },
];

const createEmployerChainable = () => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn(async () => mockEmployers),
});

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    find: jest.fn(() => createEmployerChainable()),
  },
}));

jest.mock("@/lib/cron/scale", () => ({
  forEachBounded: jest.fn(
    async (items: unknown[], _concurrency: number, fn: (item: unknown) => Promise<void>, _name: string) => {
      let ok = 0;
      let failed = 0;
      for (const item of items as unknown[]) {
        try {
          await fn(item);
          ok++;
        } catch {
          failed++;
        }
      }
      return { ok, failed };
    }
  ),
  byId: (items: Array<{ _id: string }>) => {
    const map = new Map<string, (typeof items)[number]>();
    items.forEach((item) => map.set(String(item._id), item));
    return map;
  },
}));

describe("GET /api/cron/strong-candidate-alerts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNotify.mockClear();
    mockNotify.mockResolvedValue(undefined);
    mockApplicationResult = mockApplications;

    // Reset Application mocks
    const Application = require("@/models/Application").default;
    Application.find.mockClear();
    Application.find.mockImplementation(() => createApplicationChainable());
    Application.updateMany.mockClear();
    Application.updateMany.mockResolvedValue({ modifiedCount: 4 });
  });

  it("groups by employer and job, sending one notification per pair with correct counts", async () => {
    const { GET } = await import("@/app/api/cron/strong-candidate-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/strong-candidate-alerts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const payload = await res.json();

    // Should send 3 notifications: emp_001/job_001 (2), emp_001/job_002 (1), emp_002/job_003 (1)
    expect(payload.candidates).toBe(4);
    expect(payload.notificationsSent).toBe(3);
    expect(payload.success).toBe(true);

    // Verify notify was called 3 times with correct data
    expect(mockNotify).toHaveBeenCalledTimes(3);

    // Check first notification: 2 candidates for Frontend Engineer
    const call1 = mockNotify.mock.calls[0][0];
    expect(call1.userId).toBe("user_001");
    expect(call1.title).toBe("2 strong candidates for Frontend Engineer");
    expect(call1.params.count).toBe(2);
    expect(call1.params.jobTitle).toBe("Frontend Engineer");
    expect(call1.link).toContain("/employer/jobs/job_001/applications");

    // Check second notification: 1 candidate for Backend Engineer
    const call2 = mockNotify.mock.calls[1][0];
    expect(call2.userId).toBe("user_001");
    expect(call2.title).toBe("1 strong candidate for Backend Engineer");
    expect(call2.params.count).toBe(1);

    // Check third notification: 1 candidate for Product Manager
    const call3 = mockNotify.mock.calls[2][0];
    expect(call3.userId).toBe("user_002");
    expect(call3.title).toBe("1 strong candidate for Product Manager");
  });

  it("stamps strongAlertSentAt BEFORE calling notify", async () => {
    const Application = require("@/models/Application").default;

    // Verify updateMany was called before notify finishes
    const callOrder: string[] = [];

    Application.updateMany.mockImplementation(async () => {
      callOrder.push("updateMany");
      return { modifiedCount: mockApplications.length };
    });

    mockNotify.mockImplementation(async () => {
      callOrder.push("notify");
    });

    const { GET } = await import("@/app/api/cron/strong-candidate-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/strong-candidate-alerts");
    await GET(req);

    // Verify updateMany was called first
    expect(callOrder[0]).toBe("updateMany");
    expect(callOrder.slice(1)).toEqual(expect.arrayContaining(["notify", "notify", "notify"]));

    expect(Application.updateMany).toHaveBeenCalledWith(
      { _id: { $in: mockApplications.map((a) => a._id) } },
      { $set: { strongAlertSentAt: expect.any(Date) } }
    );
  });

  it("respects emailNewApplicant preference when sendEmail is false", async () => {
    const { GET } = await import("@/app/api/cron/strong-candidate-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/strong-candidate-alerts");
    await GET(req);

    // emp_002 has emailNewApplicant: false, so their notification should have sendEmail: false
    const emp2Call = mockNotify.mock.calls.find((call) => call[0].userId === "user_002");
    expect(emp2Call[0].sendEmail).toBe(false);

    // emp_001 has emailNewApplicant: true, so their notifications should have sendEmail: true
    const emp1Calls = mockNotify.mock.calls.filter((call) => call[0].userId === "user_001");
    emp1Calls.forEach((call) => {
      expect(call[0].sendEmail).toBe(true);
    });
  });

  it("returns success with zero notifications when no strong candidates found", async () => {
    mockApplicationResult = [];

    const { GET } = await import("@/app/api/cron/strong-candidate-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/strong-candidate-alerts");
    const res = await GET(req);

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.candidates).toBe(0);
    expect(payload.notificationsSent).toBe(0);
    expect(payload.success).toBe(true);

    const Application = require("@/models/Application").default;
    // updateMany should NOT be called when there are no candidates
    expect(Application.updateMany).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("includes correct keys and params in notify payload", async () => {
    const { GET } = await import("@/app/api/cron/strong-candidate-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/strong-candidate-alerts");
    await GET(req);

    const firstCall = mockNotify.mock.calls[0][0];
    expect(firstCall.titleKey).toBe("strongCandidatesTitle");
    expect(firstCall.bodyKey).toBe("strongCandidatesBody");
    expect(firstCall.params).toEqual({
      count: 2,
      jobTitle: "Frontend Engineer",
      threshold: 80,
    });
  });

  it("constructs link with scoreMin and sort query params", async () => {
    const { GET } = await import("@/app/api/cron/strong-candidate-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/strong-candidate-alerts");
    await GET(req);

    const firstCall = mockNotify.mock.calls[0][0];
    expect(firstCall.link).toBe("/employer/jobs/job_001/applications?scoreMin=80&sort=score");
  });
});
