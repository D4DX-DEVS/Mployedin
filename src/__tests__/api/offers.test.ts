/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: { userId: string; role: "job_seeker"; locale: string }) => Promise<Response>) => {
    return (req: NextRequest) => handler(req, { userId: "user_001", role: "job_seeker", locale: "en" });
  },
}));

const offerQuery = {
  sort: jest.fn(),
  skip: jest.fn(),
  limit: jest.fn(),
  populate: jest.fn(),
  lean: jest.fn(),
};

Object.values(offerQuery).forEach((fn) => (fn as jest.Mock).mockReturnThis());
(offerQuery.lean as jest.Mock).mockResolvedValue([
  {
    _id: "offer_001",
    jobId: { _id: "job_001", title: "Frontend Developer", location: "Dubai" },
    applicationId: { _id: "app_001", status: "offer" },
    jobSeekerId: { _id: "seeker_001", fullName: "Candidate", userId: { name: "Candidate", email: "candidate@example.com" } },
    employerId: { _id: "emp_001", companyName: "Acme" },
    salary: { amount: 12000, currency: "AED", period: "monthly" },
    status: "pending",
    startDate: new Date("2026-07-01T00:00:00.000Z"),
    expiresAt: new Date("2026-07-08T00:00:00.000Z"),
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
  },
]);

const seekerFindOneQuery = {
  select: jest.fn(),
  lean: jest.fn(),
};

(seekerFindOneQuery.select as jest.Mock).mockReturnValue(seekerFindOneQuery);
(seekerFindOneQuery.lean as jest.Mock).mockResolvedValue({ _id: "seeker_001" });

jest.mock("@/models/Offer", () => ({
  __esModule: true,
  default: {
    find: jest.fn().mockReturnValue(offerQuery),
    countDocuments: jest.fn().mockResolvedValue(1),
    create: jest.fn(),
  },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn().mockReturnValue(seekerFindOneQuery),
    find: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: jest.fn() },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: jest.fn() },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(), findByIdAndUpdate: jest.fn() },
}));

jest.mock("@/lib/validators", () => ({
  validateBody: jest.fn(),
}));

jest.mock("@/lib/validators/offers", () => ({
  offerCreateSchema: {},
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn(),
  logActivity: jest.fn(),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn(),
}));

function makeRequest(url: string): NextRequest {
  return new NextRequest(`http://localhost:3000${url}`);
}

const routeContext = { params: Promise.resolve({}) };

describe("Offers API", () => {
  it("returns both nested offers and flattened items for existing consumers", async () => {
    const { GET } = await import("@/app/api/offers/route");
    const res = await GET(makeRequest("/api/offers?page=2&limit=10"), routeContext);

    expect(res.status).toBe(200);
    const payload = await res.json();

    expect(payload.offers).toHaveLength(1);
    expect(payload.offers[0].jobId.title).toBe("Frontend Developer");
    expect(payload.items).toEqual([
      expect.objectContaining({
        _id: "offer_001",
        candidateName: "Candidate",
        jobTitle: "Frontend Developer",
        companyName: "Acme",
      }),
    ]);
    expect(payload.pagination).toEqual(expect.objectContaining({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    }));
  });
});