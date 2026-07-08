/**
 * @jest-environment node
 */
/**
 * API Tests — Profile Boost
 * Tests: GET (boost status), POST (activate boost), auth enforcement
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

const mockSeeker = {
  _id: "seeker_001",
  userId: "user_001",
  isProfileBoosted: false,
  profileBoostedUntil: null,
  profileBoostCount: 0,
  headline: "Full Stack Developer",
  save: jest.fn().mockResolvedValue(true),
};

const mockFindOne = jest.fn();
const mockFindByIdAndUpdate = jest.fn().mockResolvedValue(true);
const mockFindOneAndUpdate = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: (...args: unknown[]) => mockFindOne(...args),
    findByIdAndUpdate: (...args: unknown[]) => mockFindByIdAndUpdate(...args),
    findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
  },
}));

jest.mock("@/lib/subscription/featureGate", () => ({
  enforceFeatureGate: jest.fn().mockResolvedValue(null),
}));

// Mock withAuth to pass context
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

describe("Profile Boost API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/job-seeker/profile-boost", () => {
    it("returns 403 for non-job-seeker", async () => {
      const { GET } = await import("@/app/api/job-seeker/profile-boost/route");
      const req = new NextRequest("http://localhost/api/job-seeker/profile-boost");
      const ctx = { userId: "user_001", role: "employer" };
      const res = await (GET as Function)(req, ctx);

      expect(res.status).toBe(403);
    });

    it("returns boost status for job seeker", async () => {
      mockFindOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            isProfileBoosted: false,
            profileBoostedUntil: null,
            profileBoostCount: 0,
            headline: "Developer",
          }),
        }),
      });

      const { GET } = await import("@/app/api/job-seeker/profile-boost/route");
      const req = new NextRequest("http://localhost/api/job-seeker/profile-boost");
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (GET as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isActive).toBe(false);
      expect(data.boostCount).toBe(0);
    });

    it("shows active boost when within window", async () => {
      const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      mockFindOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            isProfileBoosted: true,
            profileBoostedUntil: future,
            profileBoostCount: 1,
            headline: "Developer",
          }),
        }),
      });

      const { GET } = await import("@/app/api/job-seeker/profile-boost/route");
      const req = new NextRequest("http://localhost/api/job-seeker/profile-boost");
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (GET as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.isActive).toBe(true);
      expect(data.boostedUntil).toBeTruthy();
    });
  });

  describe("POST /api/job-seeker/profile-boost", () => {
    it("returns 403 for non-job-seeker", async () => {
      const { POST } = await import("@/app/api/job-seeker/profile-boost/route");
      const req = new NextRequest("http://localhost/api/job-seeker/profile-boost", { method: "POST" });
      const ctx = { userId: "user_001", role: "employer" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(403);
    });

    it("activates boost for 7 days", async () => {
      mockFindOneAndUpdate.mockResolvedValue({ ...mockSeeker, isProfileBoosted: true });

      const { POST } = await import("@/app/api/job-seeker/profile-boost/route");
      const req = new NextRequest("http://localhost/api/job-seeker/profile-boost", {
        method: "POST",
        body: JSON.stringify({ headline: "Top Rated Developer" }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.boostedUntil).toBeDefined();
    });

    it("rejects boost if already active", async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
      mockFindOneAndUpdate.mockResolvedValue(null);
      mockFindOne.mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ profileBoostedUntil: futureDate }),
        }),
      });

      const { POST } = await import("@/app/api/job-seeker/profile-boost/route");
      const req = new NextRequest("http://localhost/api/job-seeker/profile-boost", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(400);
    });
  });
});
