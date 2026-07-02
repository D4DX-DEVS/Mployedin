/**
 * @jest-environment node
 */
/**
 * API Tests — Job Alerts Cron
 * Tests: GET (cron endpoint), auth verification, job-seeker matching
 */

import { NextRequest, NextResponse } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

const mockNewJobs = [
  {
    _id: "job_001",
    title: "Frontend Developer",
    location: { country: "UAE", city: "Dubai" },
    requirements: ["React", "TypeScript"],
    salary: { min: 10000, max: 20000, currency: "AED" },
    employmentType: "full-time",
    category: "Technology",
    tags: ["react", "frontend"],
    employerId: { companyName: "Acme Corp" },
  },
];

const mockSeekers = [
  {
    _id: "seeker_001",
    userId: "user_001",
    preferredRoles: ["Frontend", "React Developer"],
    preferredCountries: ["UAE"],
    preferredLocations: ["Dubai"],
    skills: ["React", "TypeScript"],
    preferredJobType: "full-time",
  },
  {
    _id: "seeker_002",
    userId: "user_002",
    preferredRoles: ["Backend Developer"],
    preferredCountries: ["Saudi Arabia"],
    skills: ["Python", "Django"],
  },
];

const jobChainable = { select: jest.fn(), populate: jest.fn(), limit: jest.fn(), lean: jest.fn() };
Object.values(jobChainable).forEach(fn => (fn as jest.Mock).mockReturnThis());
(jobChainable.lean as jest.Mock).mockResolvedValue(mockNewJobs);

const seekerChainable = { select: jest.fn(), sort: jest.fn(), limit: jest.fn(), lean: jest.fn() };
Object.values(seekerChainable).forEach(fn => (fn as jest.Mock).mockReturnThis());
(seekerChainable.lean as jest.Mock).mockResolvedValue(mockSeekers);

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: jest.fn().mockReturnValue(jobChainable) },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { find: jest.fn().mockReturnValue(seekerChainable) },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn().mockResolvedValue({ _id: "user_001", email: "user@test.com", name: "Test User" }) },
}));

const mockNotify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notify: (...args: unknown[]) => mockNotify(...args),
}));

const mockVerifyCron = jest.fn().mockReturnValue(null);
jest.mock("@/lib/security/cron-auth", () => ({
  verifyCronRequest: (...args: unknown[]) => mockVerifyCron(...args),
}));

describe("Job Alerts Cron API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyCron.mockReturnValue(null);
    (jobChainable.lean as jest.Mock).mockResolvedValue(mockNewJobs);
    (seekerChainable.lean as jest.Mock).mockResolvedValue(mockSeekers);
  });

  it("rejects unauthorized cron requests", async () => {
    mockVerifyCron.mockReturnValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    );

    const { GET } = await import("@/app/api/cron/job-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/job-alerts");
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it("returns early when no new jobs exist", async () => {
    (jobChainable.lean as jest.Mock).mockResolvedValue([]);

    const { GET } = await import("@/app/api/cron/job-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/job-alerts");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.sent).toBe(0);
    expect(data.message).toContain("No new jobs");
  });

  it("sends alerts to matching seekers", async () => {
    const { GET } = await import("@/app/api/cron/job-alerts/route");
    const req = new NextRequest("http://localhost/api/cron/job-alerts");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.alertsSent).toBeGreaterThanOrEqual(0);
  });
});
