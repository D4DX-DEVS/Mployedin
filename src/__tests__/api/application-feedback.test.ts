/**
 * @jest-environment node
 */
/**
 * API Tests — Application Feedback
 * Tests: GET (feedback history), POST (submit feedback), auth/role enforcement
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

const mockFeedback = [
  { _id: "fb_1", applicationId: "app_001", rating: 4, comment: "Good process", userId: "user_001" },
];

const feedbackChainable = { sort: jest.fn(), limit: jest.fn(), lean: jest.fn() };
Object.values(feedbackChainable).forEach(fn => (fn as jest.Mock).mockReturnThis());
(feedbackChainable.lean as jest.Mock).mockResolvedValue(mockFeedback);

const mockFeedbackFindOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
const mockFeedbackCreate = jest.fn().mockResolvedValue({ _id: "fb_new", rating: 4 });

jest.mock("@/models/ApplicationFeedback", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(feedbackChainable),
    findOne: (...args: unknown[]) => mockFeedbackFindOne(...args),
    create: mockFeedbackCreate,
  },
}));

// jobSeekerId is a JobSeeker._id, NOT the User._id in ctx.userId — keep these
// two ids distinct so the ownership check is exercised the way production sees it.
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: "app_001",
        jobSeekerId: "seeker_001",
        status: "rejected",
        jobId: "job_001",
        employerId: "emp_001",
      }),
    }),
  },
}));

// Resolves User._id → JobSeeker._id. Returning a different _id simulates
// somebody else's application.
const mockSeekerLean = jest.fn().mockResolvedValue({ _id: "seeker_001" });
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: (...a: unknown[]) => mockSeekerLean(...a) }),
    }),
  },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

describe("Application Feedback API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (feedbackChainable.lean as jest.Mock).mockResolvedValue(mockFeedback);
    mockFeedbackFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockSeekerLean.mockResolvedValue({ _id: "seeker_001" });
  });

  describe("GET /api/application-feedback", () => {
    it("returns feedback history for job seeker", async () => {
      const { GET } = await import("@/app/api/application-feedback/route");
      const req = new NextRequest("http://localhost/api/application-feedback");
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (GET as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.feedbacks).toHaveLength(1);
    });

    it("returns specific feedback when applicationId provided", async () => {
      mockFeedbackFindOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "fb_1", rating: 4 }),
      });

      const { GET } = await import("@/app/api/application-feedback/route");
      const req = new NextRequest("http://localhost/api/application-feedback?applicationId=app_001");
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (GET as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.feedback).toBeDefined();
      expect(data.feedback.rating).toBe(4);
    });
  });

  describe("POST /api/application-feedback", () => {
    it("rejects non-job-seeker", async () => {
      const { POST } = await import("@/app/api/application-feedback/route");
      const req = new NextRequest("http://localhost/api/application-feedback", {
        method: "POST",
        body: JSON.stringify({ applicationId: "app_001", rating: 4 }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "employer" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(403);
    });

    it("rejects feedback on another job seeker's application (403)", async () => {
      mockSeekerLean.mockResolvedValue({ _id: "seeker_999" });

      const { POST } = await import("@/app/api/application-feedback/route");
      const req = new NextRequest("http://localhost/api/application-feedback", {
        method: "POST",
        body: JSON.stringify({ applicationId: "app_001", rating: 4 }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(403);
      expect(mockFeedbackCreate).not.toHaveBeenCalled();
    });

    it("rejects when the caller has no job seeker profile (403)", async () => {
      mockSeekerLean.mockResolvedValue(null);

      const { POST } = await import("@/app/api/application-feedback/route");
      const req = new NextRequest("http://localhost/api/application-feedback", {
        method: "POST",
        body: JSON.stringify({ applicationId: "app_001", rating: 4 }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(403);
    });

    it("creates feedback with valid data", async () => {
      const { POST } = await import("@/app/api/application-feedback/route");
      const body = {
        applicationId: "app_001",
        rating: 4,
        comment: "Process was smooth overall",
        aspects: { communicationRating: 5, processRating: 4 },
        wouldRecommend: true,
      };
      const req = new NextRequest("http://localhost/api/application-feedback", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.feedback).toBeDefined();
      expect(mockFeedbackCreate).toHaveBeenCalled();
    });

    it("rejects if feedback already exists (409)", async () => {
      mockFeedbackFindOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: "existing" }),
      });

      const { POST } = await import("@/app/api/application-feedback/route");
      const req = new NextRequest("http://localhost/api/application-feedback", {
        method: "POST",
        body: JSON.stringify({ applicationId: "app_001", rating: 4 }),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(409);
    });
  });
});
