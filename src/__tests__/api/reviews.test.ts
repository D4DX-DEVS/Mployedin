/**
 * @jest-environment node
 */
/**
 * API Tests — Company Reviews
 * Tests: GET (public list), POST (create review), validation, auth
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

const mockReviews = [
  { _id: "rev_1", employerId: "emp_001", rating: 5, title: "Great place", pros: "Good culture", cons: "Long hours", userId: { name: "Ali" }, createdAt: new Date() },
  { _id: "rev_2", employerId: "emp_001", rating: 4, title: "Nice team", pros: "Helpful colleagues", cons: "Low salary", userId: { name: "Sara" }, createdAt: new Date() },
];

const mockAggregate = jest.fn().mockResolvedValue([{
  _id: null, avgRating: 4.5, totalReviews: 2, recommended: 2,
  rating5: 1, rating4: 1, rating3: 0, rating2: 0, rating1: 0,
}]);

const chainable = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), populate: jest.fn(), lean: jest.fn() };
Object.values(chainable).forEach(fn => (fn as jest.Mock).mockReturnThis());
(chainable.lean as jest.Mock).mockResolvedValue(mockReviews);

const mockCountDocuments = jest.fn().mockResolvedValue(2);
const mockCreate = jest.fn().mockResolvedValue({ _id: "rev_new", rating: 4, title: "Good workplace environment" });
const mockFindOne = jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });

jest.mock("@/models/CompanyReview", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(chainable),
    countDocuments: mockCountDocuments,
    aggregate: mockAggregate,
    findOne: mockFindOne,
    create: mockCreate,
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    findById: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "emp_001", companyName: "Acme" }) }),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn().mockResolvedValue({ _id: "user_001", name: "Test User" }) },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

describe("Reviews API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (chainable.lean as jest.Mock).mockResolvedValue(mockReviews);
    mockFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
  });

  describe("GET /api/reviews", () => {
    it("returns 400 when employerId is missing", async () => {
      const { GET } = await import("@/app/api/reviews/route");
      const req = new NextRequest("http://localhost/api/reviews");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toContain("employerId");
    });

    it("returns paginated reviews with stats for a company", async () => {
      const { GET } = await import("@/app/api/reviews/route");
      const req = new NextRequest("http://localhost/api/reviews?employerId=emp_001&page=1&limit=10");
      const res = await GET(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.reviews).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.stats).toBeDefined();
      expect(data.stats.avgRating).toBe(4.5);
    });
  });

  describe("POST /api/reviews", () => {
    it("creates a review with valid data", async () => {
      const { POST } = await import("@/app/api/reviews/route");
      const body = {
        employerId: "emp_001",
        rating: 4,
        title: "Good workplace environment",
        pros: "Flexible hours and friendly team",
        cons: "Limited growth opportunities here",
      };
      const req = new NextRequest("http://localhost/api/reviews", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.review).toBeDefined();
      expect(mockCreate).toHaveBeenCalled();
    });

    it("rejects duplicate review (409)", async () => {
      mockFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "existing" }) });

      const { POST } = await import("@/app/api/reviews/route");
      const body = {
        employerId: "emp_001",
        rating: 4,
        title: "Another review for same company",
        pros: "Flexible hours and friendly team",
        cons: "Limited growth opportunities here",
      };
      const req = new NextRequest("http://localhost/api/reviews", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(409);
    });

    it("rejects non-job-seeker", async () => {
      const { POST } = await import("@/app/api/reviews/route");
      const body = {
        employerId: "emp_001",
        rating: 4,
        title: "Good workplace environment",
        pros: "Flexible hours and friendly team",
        cons: "Limited growth opportunities here",
      };
      const req = new NextRequest("http://localhost/api/reviews", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "employer" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(403);
    });
  });
});
