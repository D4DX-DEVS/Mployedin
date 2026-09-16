/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";

// Unlike the sibling offers.test.ts, this suite deliberately uses the REAL
// validator and the REAL schema. The point is to prove the expiry bounds are
// actually reachable through the route — a schema that rejects in isolation is
// worth nothing if the handler never runs it, or runs it after something else
// has already returned.
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

// Mirror the real withAuth contract: validateBody signals failure by *throwing*
// a NextResponse, and withAuth turns that back into the HTTP response.
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (
    handler: (req: NextRequest, ctx: { userId: string; role: string; locale: string }) => Promise<Response>
  ) => {
    return async (req: NextRequest) => {
      try {
        return await handler(req, { userId: "user_emp", role: "employer", locale: "en" });
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    };
  },
}));

const employerQuery = { select: jest.fn(), lean: jest.fn() };
employerQuery.select.mockReturnValue(employerQuery);
employerQuery.lean.mockResolvedValue({ _id: "emp_001" });

jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(() => employerQuery) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findById: jest.fn(), findOne: jest.fn() } }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/Offer", () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), countDocuments: jest.fn(), create: jest.fn() },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(), findByIdAndUpdate: jest.fn() },
}));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(), logActivity: jest.fn() }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/hiring/closeOpenInterviews", () => ({ closeOpenInterviewsForAdvance: jest.fn() }));

const DAY = 24 * 60 * 60 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

function postRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const routeContext = { params: Promise.resolve({}) };

const baseBody = {
  applicationId: "6a9eee5a1c2d3e4f5a6b7c8d",
  salary: { amount: 12000, currency: "AED", period: "monthly" },
};

async function postOffer(body: unknown) {
  const { POST } = await import("@/app/api/offers/route");
  const res = await POST(postRequest(body), routeContext);
  return { status: res.status, payload: await res.json() };
}

const expiryIssues = (payload: { details?: { path: string; message: string }[] }) =>
  (payload.details ?? []).filter((d) => d.path === "expiresAt");

describe("POST /api/offers expiry validation", () => {
  it("rejects an expiry that has already passed", async () => {
    const { status, payload } = await postOffer({
      ...baseBody,
      startDate: iso(30 * DAY),
      expiresAt: iso(-1 * DAY),
    });

    expect(status).toBe(400);
    expect(payload.error).toBe("Validation failed");
    expect(expiryIssues(payload)).toContainEqual(
      expect.objectContaining({ message: "Expiry date must be in the future" })
    );
  });

  it("rejects an expiry that falls after the start date", async () => {
    const { status, payload } = await postOffer({
      ...baseBody,
      startDate: iso(7 * DAY),
      expiresAt: iso(30 * DAY),
    });

    expect(status).toBe(400);
    expect(expiryIssues(payload)).toContainEqual(
      expect.objectContaining({ message: "Expiry date must be on or before the start date" })
    );
  });

  it("lets a well-formed expiry through validation and on to the handler", async () => {
    const Application = (await import("@/models/Application")).default;
    (Application.findById as jest.Mock).mockReturnValue({
      populate: jest.fn().mockResolvedValue(null), // 404s *after* validation passes
    });

    const { status, payload } = await postOffer({
      ...baseBody,
      startDate: iso(30 * DAY),
      expiresAt: iso(7 * DAY),
    });

    expect(status).toBe(404);
    expect(payload.error).toBe("Application not found");
  });
});
