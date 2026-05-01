/**
 * @jest-environment node
 */
/**
 * API Tests — Assessments
 * Tests: GET (list), POST (create), role-based access
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({
  auth: jest.fn(),
}));

const mockAssessments = [
  { _id: "assess_001", title: "React Proficiency", skills: ["React"], questions: [], passingScore: 70, timeLimit: 30 },
];

const assessChainable = { sort: jest.fn(), skip: jest.fn(), limit: jest.fn(), select: jest.fn(), lean: jest.fn() };
Object.values(assessChainable).forEach(fn => (fn as jest.Mock).mockReturnThis());
(assessChainable.lean as jest.Mock).mockResolvedValue(mockAssessments);

const mockCreate = jest.fn().mockResolvedValue({ _id: "assess_new", title: "TypeScript Advanced Assessment" });

jest.mock("@/models/SkillAssessment", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(assessChainable),
    countDocuments: jest.fn().mockResolvedValue(1),
    create: mockCreate,
  },
}));

jest.mock("@/models/AssessmentAttempt", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([]) }),
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { findOne: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: "emp_001", userId: "user_001" }) }) },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => handler,
}));

describe("Assessments API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (assessChainable.lean as jest.Mock).mockResolvedValue(mockAssessments);
  });

  describe("GET /api/assessments", () => {
    it("returns employer assessments", async () => {
      const { GET } = await import("@/app/api/assessments/route");
      const req = new NextRequest("http://localhost/api/assessments");
      const ctx = { userId: "user_001", role: "employer" };
      const res = await (GET as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.assessments).toBeDefined();
      expect(data.total).toBe(1);
    });
  });

  describe("POST /api/assessments", () => {
    it("creates an assessment with valid data", async () => {
      const { POST } = await import("@/app/api/assessments/route");
      const body = {
        title: "TypeScript Advanced Assessment",
        description: "Tests advanced TS skills",
        skills: ["TypeScript"],
        questions: [
          { id: "q1", question: "What are generics?", type: "short_answer", points: 10 },
        ],
        passingScore: 60,
        timeLimit: 30,
      };
      const req = new NextRequest("http://localhost/api/assessments", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "employer" };
      const res = await (POST as Function)(req, ctx);
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.assessment).toBeDefined();
    });

    it("rejects assessment without questions", async () => {
      const { POST } = await import("@/app/api/assessments/route");
      const body = {
        title: "Empty Assessment",
        skills: ["TypeScript"],
        questions: [],
        passingScore: 60,
        timeLimit: 30,
      };
      const req = new NextRequest("http://localhost/api/assessments", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "employer" };
      try {
        await (POST as Function)(req, ctx);
        fail("Should have thrown");
      } catch (thrown: unknown) {
        const res = thrown as Response;
        expect(res.status).toBe(400);
      }
    });

    it("rejects non-employer", async () => {
      const { POST } = await import("@/app/api/assessments/route");
      const body = {
        title: "Test Assessment",
        skills: ["React"],
        questions: [{ id: "q1", question: "What is React?", type: "short_answer", points: 5 }],
      };
      const req = new NextRequest("http://localhost/api/assessments", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      const ctx = { userId: "user_001", role: "job_seeker" };
      const res = await (POST as Function)(req, ctx);

      expect(res.status).toBe(403);
    });
  });
});
